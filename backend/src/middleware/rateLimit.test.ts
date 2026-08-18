import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { createJsonRateLimiter } from './rateLimit';

describe('createJsonRateLimiter', () => {
  it('returns 429 after the configured limit without leaking internals', async () => {
    const app = express();
    app.use(createJsonRateLimiter(2, 60_000, 'Too many requests. Please wait a moment and try again.'));
    app.get('/ping', (_req, res) => {
      res.json({ ok: true });
    });
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('listen failed');
    }
    const base = `http://127.0.0.1:${address.port}`;
    try {
      assert.equal((await fetch(`${base}/ping`)).status, 200);
      assert.equal((await fetch(`${base}/ping`)).status, 200);
      const limited = await fetch(`${base}/ping`);
      assert.equal(limited.status, 429);
      const body = (await limited.json()) as { error?: { code?: string; message?: string } };
      assert.equal(body.error?.code, 'RATE_LIMITED');
      assert.match(body.error?.message ?? '', /wait/i);
      assert.equal(JSON.stringify(body).includes('stack'), false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
