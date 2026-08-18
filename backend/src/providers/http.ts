import {
  InsufficientPermissionsError,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  TokenExpiredError,
  TokenInvalidError,
} from '../types/errors';
import { mapGoogleApiError } from './youtube/youtubeErrors';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: URLSearchParams | string;
  timeoutMs?: number;
}

export async function providerFetch(url: string, options: HttpRequestOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
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

export async function providerJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
  const response = await providerFetch(url, options);
  await throwIfProviderError(response);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function throwIfProviderError(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const raw = await response.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }

  const mapped = mapGoogleApiError(response.status, body);
  if (mapped) {
    throw mapped;
  }

  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : undefined;

  if (response.status === 401) {
    throw new TokenExpiredError();
  }
  if (response.status === 403) {
    throw new InsufficientPermissionsError();
  }
  if (response.status === 404) {
    throw new NotFoundError('That item was not found on the music service.');
  }
  if (response.status === 429) {
    throw new RateLimitedError(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined);
  }
  if (response.status === 400) {
    throw new TokenInvalidError('The music service rejected the request. Please reconnect the account.');
  }

  throw new NetworkError(`The music service returned HTTP ${response.status}.`);
}

export function bearerHeaders(accessToken: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...extra,
  };
}

export function requireAccessToken(accessToken: string | undefined): string {
  if (!accessToken) {
    throw new TokenInvalidError('Connect this music service before using it.');
  }
  return accessToken;
}
