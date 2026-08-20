import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderApiUrl, resolvePublicApiUrl } from './apiUrl';

describe('resolvePublicApiUrl', () => {
  it('rejects missing and localhost values in production', () => {
    assert.throws(() => resolvePublicApiUrl({ value: '', nodeEnv: 'production', devFlag: false }), /required in production/i);
    assert.throws(
      () => resolvePublicApiUrl({ value: 'http://127.0.0.1:4000', nodeEnv: 'production', devFlag: false }),
      /loopback/i,
    );
    assert.throws(
      () => resolvePublicApiUrl({ value: 'http://api.example.com', nodeEnv: 'production', devFlag: false }),
      /https/i,
    );
  });

  it('accepts an explicit https production URL', () => {
    assert.equal(
      resolvePublicApiUrl({ value: 'https://YOUR_PRODUCTION_BACKEND_DOMAIN/', nodeEnv: 'production', devFlag: false }),
      'https://YOUR_PRODUCTION_BACKEND_DOMAIN',
    );
  });

  it('allows explicit localhost in development', () => {
    assert.equal(
      resolvePublicApiUrl({ value: 'http://127.0.0.1:4000', nodeEnv: 'development', devFlag: true }),
      'http://127.0.0.1:4000',
    );
  });

  it('does not silently default localhost in development', () => {
    assert.throws(() => resolvePublicApiUrl({ value: '', nodeEnv: 'development', devFlag: true }), /explicitly/i);
  });
});

describe('isPlaceholderApiUrl', () => {
  it('detects documented placeholder hosts and not a real origin', () => {
    assert.equal(isPlaceholderApiUrl('https://YOUR-RENDER-SERVICE.onrender.com'), true);
    assert.equal(isPlaceholderApiUrl('https://YOUR-REAL-RENDER-URL.onrender.com'), true);
    assert.equal(isPlaceholderApiUrl('https://YOUR_PRODUCTION_BACKEND_DOMAIN'), true);
    assert.equal(isPlaceholderApiUrl('https://api.example.com'), false);
  });
});
