import {
  AppError,
  ErrorCode,
  InsufficientPermissionsError,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  SpotifyInvalidTokenError,
  SpotifyServerError,
  TokenExpiredError,
} from '../../types/errors';
import { logger } from '../../utils/logger';
import { isLikelyJwt } from '../../utils/crypto';

export const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';

export function spotifyUserBearerHeaders(accessToken: string): Record<string, string> {
  const token = accessToken.trim();
  if (!token || isLikelyJwt(token)) {
    throw new TokenExpiredError('Spotify access token expired.');
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

export function isSpotifyWebApiErrorPayload(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return false;
  }
  return typeof (error as { status?: unknown }).status === 'number';
}

function spotifyWebApiMessage(body: unknown): { status?: number; message?: string } {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') {
    return { message: error };
  }
  if (!error || typeof error !== 'object') {
    return {};
  }
  const status = (error as { status?: unknown }).status;
  const message = (error as { message?: unknown }).message;
  return {
    status: typeof status === 'number' ? status : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

function isSpotifyBearerAuthFailure(message: string): boolean {
  return /only valid bearer authentication supported|invalid access token|the access token expired|no token provided/i.test(
    message,
  );
}

function safeSpotifyWebApiErrorField(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.length > 180) {
    return undefined;
  }
  if (/access_token|refresh_token|client_secret|code_verifier|bearer\s+[A-Za-z0-9._~+/-]{8,}/i.test(value)) {
    return undefined;
  }
  return value;
}

export function isSpotifyAuthSearchStatus(status: number, message: string): boolean {
  if (status === 401) {
    return true;
  }
  return status === 400 && isSpotifyBearerAuthFailure(message);
}

export interface SpotifySearchHttpResult {
  status: number;
  ok: boolean;
  body: unknown;
  error: string | undefined;
  errorDescription: string | undefined;
  rawMessage: string;
}

async function spotifySearchFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError('The music service took too long to respond.');
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
}

function searchErrorFields(body: unknown): {
  error: string | undefined;
  errorDescription: string | undefined;
  rawMessage: string;
} {
  const parsed = spotifyWebApiMessage(body);
  const stringError =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? String((body as { error: string }).error)
      : undefined;
  const description =
    body && typeof body === 'object' && typeof (body as { error_description?: unknown }).error_description === 'string'
      ? String((body as { error_description: string }).error_description)
      : parsed.message;
  const rawMessage = stringError ?? parsed.message ?? description ?? '';
  return {
    error: safeSpotifyWebApiErrorField(stringError ?? parsed.message),
    errorDescription: safeSpotifyWebApiErrorField(description),
    rawMessage,
  };
}

export async function fetchSpotifyTrackSearch(input: {
  accessToken: string;
  query: string;
  limit?: number;
  offset?: number;
  attempt: 'initial' | 'retry';
}): Promise<SpotifySearchHttpResult> {
  const url = new URL(SPOTIFY_SEARCH_URL);
  url.searchParams.set('q', input.query);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', String(input.limit ?? 20));
  url.searchParams.set('offset', String(input.offset ?? 0));
  const headers = spotifyUserBearerHeaders(input.accessToken);
  const response = await spotifySearchFetch(url.toString(), headers);
  const raw = await response.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }
  const fields = searchErrorFields(body);
  if (input.attempt === 'retry') {
    logger.info('spotify search retry', {
      spotifyRetryStatus: response.status,
      spotifyRetryError: fields.error ?? null,
    });
  } else {
    logger.info('spotify search response', {
      spotifySearchStatus: response.status,
      spotifySearchError: fields.error ?? null,
      spotifySearchErrorDescription: fields.errorDescription ?? null,
    });
  }
  return {
    status: response.status,
    ok: response.ok,
    body,
    error: fields.error,
    errorDescription: fields.errorDescription,
    rawMessage: fields.rawMessage,
  };
}

export function mapSpotifySearchFailure(
  result: SpotifySearchHttpResult,
  options?: { afterRefresh?: boolean },
): AppError {
  const message = result.rawMessage || result.error || result.errorDescription || '';
  if (isSpotifyAuthSearchStatus(result.status, message)) {
    if (options?.afterRefresh) {
      return new SpotifyInvalidTokenError();
    }
    return new TokenExpiredError('Spotify access token expired.');
  }
  if (result.status === 429) {
    return new RateLimitedError();
  }
  if (result.status >= 500) {
    return new SpotifyServerError();
  }
  if (result.status === 403) {
    return new InsufficientPermissionsError();
  }
  if (result.status === 404) {
    return new NotFoundError('That item was not found on the music service.');
  }
  if (result.status === 400) {
    return new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Spotify could not complete this search. Try a different query.',
      400,
      { diagnosticCode: 'SPOTIFY_SEARCH_BAD_REQUEST' },
    );
  }
  return new NetworkError(`Spotify search returned HTTP ${result.status}.`);
}

function logSpotifyWebApiError(httpStatus: number, body: unknown): void {
  const fields = searchErrorFields(body);
  logger.info('spotify web api error', {
    status: httpStatus,
    error: fields.error ?? null,
    error_description: fields.errorDescription ?? null,
  });
}

/**
 * Map Spotify Web API JSON (`{ error: { status, message } }`) to AppErrors.
 * 401 and malformed-bearer 400 are TOKEN_EXPIRED so search can refresh once.
 * Generic 400 is not a reconnect error.
 */
export function mapSpotifyWebApiError(httpStatus: number, body: unknown): AppError {
  logSpotifyWebApiError(httpStatus, body);
  const parsed = spotifyWebApiMessage(body);
  const message = parsed.message ?? '';

  if (httpStatus === 401 || parsed.status === 401) {
    return new TokenExpiredError();
  }
  if (httpStatus === 403 || parsed.status === 403) {
    return new InsufficientPermissionsError();
  }
  if (httpStatus === 429 || parsed.status === 429) {
    return new RateLimitedError();
  }
  if (httpStatus === 404 || parsed.status === 404) {
    return new NotFoundError('That item was not found on the music service.');
  }
  if ((httpStatus === 400 || parsed.status === 400) && isSpotifyBearerAuthFailure(message)) {
    return new TokenExpiredError();
  }
  if (httpStatus === 400 || parsed.status === 400) {
    return new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Spotify could not complete this search. Try a different query.',
      400,
      { diagnosticCode: 'SPOTIFY_SEARCH_BAD_REQUEST' },
    );
  }
  return new NetworkError(`The music service returned HTTP ${httpStatus}.`);
}
