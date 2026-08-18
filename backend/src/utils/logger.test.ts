import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactLogMeta } from './logger';

describe('redactLogMeta', () => {
  it('redacts tokens and OAuth secrets by key name', () => {
    const redacted = redactLogMeta({
      refreshToken: 'secret-refresh',
      access_token: 'secret-access',
      authorization_code: 'oauth-code',
      client_secret: 'oauth-secret',
      path: '/api/playlists',
      requestId: 'req-1',
      statusCode: 200,
    }) as Record<string, unknown>;
    assert.equal(redacted.refreshToken, '[redacted]');
    assert.equal(redacted.access_token, '[redacted]');
    assert.equal(redacted.authorization_code, '[redacted]');
    assert.equal(redacted.client_secret, '[redacted]');
    assert.equal(redacted.path, '/api/playlists');
    assert.equal(redacted.requestId, 'req-1');
    assert.equal(redacted.statusCode, 200);
  });
});
