import { NetworkError, RateLimitedError } from '../../types/errors';
import { providerFetch } from '../http';
import { mapAmazonApiError } from './amazonErrors';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 400;

export function amazonApiHeaders(
  accessToken: string,
  securityProfileId: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': securityProfileId,
    Accept: 'application/json',
    ...extra,
  };
}

function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) {
    return undefined;
  }
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function delayForAttempt(error: unknown, attempt: number): number {
  if (error instanceof RateLimitedError && typeof error.details?.retryAfterSeconds === 'number') {
    return Math.min(error.details.retryAfterSeconds * 1000, 15_000);
  }
  return Math.min(BASE_DELAY_MS * 2 ** attempt, 8_000);
}

export async function throwIfAmazonError(response: Response): Promise<void> {
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
  const mapped = mapAmazonApiError(response.status, body, retryAfterSeconds(response));
  if (mapped) {
    throw mapped;
  }
  throw new NetworkError(`Amazon Music returned HTTP ${response.status}.`);
}

export interface AmazonRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
}

/**
 * Official Amazon Music JSON helper. Retries 429/5xx with exponential backoff
 * (max 3 attempts). Never retries auth or validation errors infinitely.
 */
export async function amazonJson<T>(url: string, options: AmazonRequestOptions = {}): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await providerFetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
      });
      await throwIfAmazonError(response);
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof RateLimitedError ||
        (error instanceof NetworkError && attempt < MAX_ATTEMPTS - 1);
      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      await sleep(delayForAttempt(error, attempt));
    }
  }
  throw lastError;
}

export { delayForAttempt as amazonRetryDelayMs };
