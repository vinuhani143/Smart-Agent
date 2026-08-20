import {
  AppError,
  ErrorCode,
  InsufficientPermissionsError,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  TokenExpiredError,
} from '../../types/errors';
import { logger } from '../../utils/logger';
import { isLikelyJwt } from '../../utils/crypto';

export function spotifyUserBearerHeaders(accessToken: string): Record<string, string> {
  const token = accessToken.trim();
  if (!token || isLikelyJwt(token)) {
    throw new TokenExpiredError();
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
  if (/access_token|refresh_token|client_secret|code_verifier|bearer\s+[a-z0-9]/i.test(value)) {
    return undefined;
  }
  return value;
}

export function logSpotifyWebApiError(httpStatus: number, body: unknown): void {
  const parsed = spotifyWebApiMessage(body);
  const stringError =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? String((body as { error: string }).error)
      : undefined;
  const description =
    body && typeof body === 'object' && typeof (body as { error_description?: unknown }).error_description === 'string'
      ? String((body as { error_description: string }).error_description)
      : parsed.message;
  logger.info('spotify web api error', {
    status: httpStatus,
    error: safeSpotifyWebApiErrorField(stringError ?? parsed.message) ?? null,
    error_description: safeSpotifyWebApiErrorField(description) ?? null,
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
