import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundError, RateLimitedError, TokenExpiredError } from '../types/errors';
import { throwIfProviderError } from './http';

describe('throwIfProviderError', () => {
  it('maps 401 to token expiration', async () => {
    await assert.rejects(() => throwIfProviderError(new Response('{}', { status: 401 })), TokenExpiredError);
  });

  it('maps 404 without treating it as a retryable network failure', async () => {
    await assert.rejects(
      () => throwIfProviderError(new Response('{}', { status: 404 })),
      (error: unknown) => error instanceof NotFoundError,
    );
  });

  it('maps 429 to rate limiting', async () => {
    await assert.rejects(
      () => throwIfProviderError(new Response('{}', { status: 429, headers: { 'retry-after': '2' } })),
      RateLimitedError,
    );
  });
});
