import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AppError,
  ConflictError,
  ErrorCode,
  InsufficientPermissionsError,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  TokenExpiredError,
} from '../types/errors';
import { throwIfProviderError } from './http';
import { mapPool } from '../utils/asyncPool';

describe('provider HTTP error matrix', () => {
  it('accepts success statuses without throwing', async () => {
    await throwIfProviderError(new Response('{}', { status: 200 }));
    await throwIfProviderError(new Response('{}', { status: 201 }));
  });

  it('maps client and auth failures to typed errors', async () => {
    await assert.rejects(
      () => throwIfProviderError(new Response('{}', { status: 400 })),
      (error: unknown) => error instanceof AppError && (error as AppError).code === ErrorCode.VALIDATION_ERROR,
    );
    await assert.rejects(() => throwIfProviderError(new Response('{}', { status: 401 })), TokenExpiredError);
    await assert.rejects(() => throwIfProviderError(new Response('{}', { status: 403 })), InsufficientPermissionsError);
    await assert.rejects(() => throwIfProviderError(new Response('{}', { status: 404 })), NotFoundError);
    await assert.rejects(() => throwIfProviderError(new Response('{}', { status: 409 })), ConflictError);
    await assert.rejects(() => throwIfProviderError(new Response('{}', { status: 429 })), RateLimitedError);
  });

  it('maps 500/502/503 to a retryable network error', async () => {
    await assert.rejects(() => throwIfProviderError(new Response('error', { status: 500 })), NetworkError);
    await assert.rejects(() => throwIfProviderError(new Response('bad gateway', { status: 502 })), NetworkError);
    await assert.rejects(() => throwIfProviderError(new Response('unavailable', { status: 503 })), NetworkError);
  });
});

describe('mapPool', () => {
  it('keeps order with bounded concurrency', async () => {
    const seen: number[] = [];
    const result = await mapPool([1, 2, 3, 4, 5], 2, async (item) => {
      seen.push(item);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return item * 10;
    });
    assert.deepEqual(result, [10, 20, 30, 40, 50]);
    assert.equal(seen.length, 5);
  });
});
