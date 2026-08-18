import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertProductionSafeUrls } from './env';

describe('assertProductionSafeUrls', () => {
  it('allows localhost in development and test', () => {
    assert.doesNotThrow(() =>
      assertProductionSafeUrls({ NODE_ENV: 'development', API_PUBLIC_URL: 'http://localhost:4000' }),
    );
    assert.doesNotThrow(() =>
      assertProductionSafeUrls({ NODE_ENV: 'test', API_PUBLIC_URL: 'http://127.0.0.1:4000' }),
    );
  });

  it('rejects loopback and non-https production API origins', () => {
    assert.throws(
      () => assertProductionSafeUrls({ NODE_ENV: 'production', API_PUBLIC_URL: 'http://127.0.0.1:4000' }),
      /loopback/,
    );
    assert.throws(
      () => assertProductionSafeUrls({ NODE_ENV: 'production', API_PUBLIC_URL: 'http://api.internal' }),
      /https/,
    );
  });

  it('accepts an https production origin', () => {
    assert.doesNotThrow(() =>
      assertProductionSafeUrls({
        NODE_ENV: 'production',
        API_PUBLIC_URL: 'https://YOUR_PRODUCTION_BACKEND_DOMAIN',
      }),
    );
  });
});
