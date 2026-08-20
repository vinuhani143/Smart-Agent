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

  it('maps Spotify 401 search JSON to token expiration so refresh can run', async () => {
    await assert.rejects(
      () =>
        throwIfProviderError(
          new Response(JSON.stringify({ error: { status: 401, message: 'The access token expired' } }), {
            status: 401,
          }),
        ),
      TokenExpiredError,
    );
  });

  it('maps Spotify 400 bearer failures to token expiration, not reconnect copy', async () => {
    await assert.rejects(
      () =>
        throwIfProviderError(
          new Response(
            JSON.stringify({ error: { status: 400, message: 'Only valid bearer authentication supported' } }),
            { status: 400 },
          ),
        ),
      (error: Error & { code?: string }) => {
        assert.equal(error.name, 'TokenExpiredError');
        assert.equal(error.message.includes('rejected the request'), false);
        return true;
      },
    );
  });

  it('does not treat a generic Spotify 400 as a reconnect error', async () => {
    await assert.rejects(
      () =>
        throwIfProviderError(
          new Response(JSON.stringify({ error: { status: 400, message: 'Invalid limit' } }), { status: 400 }),
        ),
      (error: Error & { code?: string; statusCode?: number }) => {
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.equal(error.statusCode, 400);
        assert.equal(error.message.includes('rejected the request'), false);
        return true;
      },
    );
  });
});
