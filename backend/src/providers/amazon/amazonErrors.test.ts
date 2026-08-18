import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import { AMAZON_MUSIC_UNAVAILABLE_MESSAGE } from './amazonConfig';
import { amazonDisabledError, mapAmazonApiError } from './amazonErrors';
import { amazonRetryDelayMs } from './amazonHttp';
import { RateLimitedError } from '../../types/errors';

describe('Amazon Music error mapping', () => {
  it('returns the official unavailable message when disabled', () => {
    const error = amazonDisabledError();
    assert.equal(error.code, ErrorCode.PROVIDER_UNAVAILABLE);
    assert.equal(error.message, AMAZON_MUSIC_UNAVAILABLE_MESSAGE);
  });

  it('maps 429 THROTTLED and honors Retry-After', () => {
    const error = mapAmazonApiError(429, { error: { code: 'THROTTLED' } }, 2);
    assert.ok(error);
    assert.equal(error.code, ErrorCode.RATE_LIMITED);
    assert.equal(error.details?.retryAfterSeconds, 2);
  });

  it('maps invalid API key / closed-beta access denial', () => {
    const error = mapAmazonApiError(403, { error: { code: 'INVALID_CLIENT_ID' } });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.PROVIDER_UNAVAILABLE);
    assert.match(error.message, /closed beta/i);
    assert.equal(error.message.includes('amzn1'), false);
  });

  it('maps invalid_scope from LWA as closed-beta access denial', () => {
    const error = mapAmazonApiError(400, { error: 'invalid_scope' });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.PROVIDER_UNAVAILABLE);
  });

  it('uses Retry-After seconds for backoff and caps the wait', () => {
    const limited = new RateLimitedError(2);
    assert.equal(amazonRetryDelayMs(limited, 0), 2000);
    const uncapped = new RateLimitedError(60);
    assert.equal(amazonRetryDelayMs(uncapped, 0), 15_000);
  });
});
