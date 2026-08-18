import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import { amazonApiHeaders, amazonJson } from './amazonHttp';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Amazon Music HTTP', () => {
  it('sends Bearer token and x-api-key as the Security Profile ID', () => {
    const headers = amazonApiHeaders('Atza|access', 'amzn1.application.test-profile');
    assert.equal(headers.Authorization, 'Bearer Atza|access');
    assert.equal(headers['x-api-key'], 'amzn1.application.test-profile');
    assert.equal(Object.values(headers).includes('amzn1.application-oa2-client.test'), false);
  });

  it('retries 429 with Retry-After and then succeeds', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { code: 'THROTTLED' } }), {
          status: 429,
          headers: { 'retry-after': '0', 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await amazonJson<{ ok: boolean }>('https://api.music.amazon.dev/v1/me');
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
  });

  it('does not retry 429 infinitely', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: 'THROTTLED' } }), {
        status: 429,
        headers: { 'retry-after': '0', 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await assert.rejects(
      () => amazonJson('https://api.music.amazon.dev/v1/me'),
      (error: Error & { code?: string }) => error.code === ErrorCode.RATE_LIMITED,
    );
    assert.equal(calls, 3);
  });

  it('does not retry invalid tokens', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: 'INVALID_ACCESS_TOKEN' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await assert.rejects(() => amazonJson('https://api.music.amazon.dev/v1/me'));
    assert.equal(calls, 1);
  });
});
