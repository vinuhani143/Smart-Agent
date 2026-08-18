process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://musicmix:musicmix@127.0.0.1:5432/musicmix';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signSession } from './AuthService';

describe('signSession', () => {
  it('signs HS256 JWTs and does not embed provider tokens', () => {
    const token = signSession('user_audit_1');
    const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString()) as { alg?: string };
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;
    assert.equal(header.alg, 'HS256');
    assert.equal(payload.sub, 'user_audit_1');
    assert.equal('accessToken' in payload, false);
    assert.equal('refreshToken' in payload, false);
  });
});
