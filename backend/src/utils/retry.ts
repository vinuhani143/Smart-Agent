import { AppError, ErrorCode, NetworkError, RateLimitedError } from '../types/errors';
import { isNonRetryableProviderError } from '../providers/youtube/youtubeErrors';

const DEFAULT_ATTEMPTS = 3;
const BASE_DELAY_MS = 400;

export function isTransientProviderError(error: unknown): boolean {
  if (isNonRetryableProviderError(error)) {
    return false;
  }
  if (error instanceof RateLimitedError) {
    return true;
  }
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof AppError) {
    return error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.RATE_LIMITED;
  }
  return false;
}

function delayMs(error: unknown, attempt: number): number {
  if (error instanceof RateLimitedError && typeof error.details?.retryAfterSeconds === 'number') {
    return Math.min(error.details.retryAfterSeconds * 1000, 15_000);
  }
  return Math.min(BASE_DELAY_MS * 2 ** attempt, 8_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Retry transient provider failures with exponential backoff.
 * Never retries quota-exceeded, auth, permission, or not-found errors.
 */
export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  attempts = DEFAULT_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientProviderError(error) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(delayMs(error, attempt));
    }
  }
  throw lastError;
}
