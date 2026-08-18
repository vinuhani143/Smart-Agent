import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NetworkError,
  NotFoundError,
  RateLimitedError,
  TokenInvalidError,
  YouTubeQuotaExceededError,
} from '../types/errors';
import { isTransientProviderError, withTransientRetry } from './retry';

describe('isTransientProviderError', () => {
  it('retries network and 429, not quota, 401, or 404', () => {
    assert.equal(isTransientProviderError(new NetworkError()), true);
    assert.equal(isTransientProviderError(new RateLimitedError(1)), true);
    assert.equal(isTransientProviderError(new YouTubeQuotaExceededError()), false);
    assert.equal(isTransientProviderError(new TokenInvalidError()), false);
    assert.equal(isTransientProviderError(new NotFoundError()), false);
  });
});

describe('withTransientRetry', () => {
  it('does not retry YouTube quota exceeded', async () => {
    let attempts = 0;
    await assert.rejects(
      () =>
        withTransientRetry(async () => {
          attempts += 1;
          throw new YouTubeQuotaExceededError();
        }),
    );
    assert.equal(attempts, 1);
  });

  it('retries a transient network error a limited number of times', async () => {
    let attempts = 0;
    await assert.rejects(
      () =>
        withTransientRetry(async () => {
          attempts += 1;
          throw new NetworkError();
        }, 3),
    );
    assert.equal(attempts, 3);
  });
});
