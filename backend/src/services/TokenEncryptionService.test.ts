process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://musicmix:musicmix@127.0.0.1:5432/musicmix';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TokenEncryptionService } from './TokenEncryptionService';
import { toPublicAccount } from './TokenService';

describe('TokenEncryptionService', () => {
  it('round-trips AES-256-GCM ciphertext', () => {
    const cipher = TokenEncryptionService.encrypt('refresh-token-value');
    assert.equal(cipher.split('.').length, 3);
    assert.notEqual(cipher, 'refresh-token-value');
    assert.equal(TokenEncryptionService.decrypt(cipher), 'refresh-token-value');
  });

  it('returns legacy PKCE verifiers that are not ciphertext', () => {
    assert.equal(TokenEncryptionService.decryptOrPlain('plain-verifier'), 'plain-verifier');
  });
});

describe('toPublicAccount', () => {
  it('never includes access or refresh tokens', () => {
    const publicAccount = toPublicAccount({
      provider: 'SPOTIFY',
      providerUserId: 'spotify-user',
      displayName: 'Listener',
      imageUrl: null,
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.equal('accessToken' in publicAccount, false);
    assert.equal('refreshToken' in publicAccount, false);
    assert.equal(JSON.stringify(publicAccount).includes('accessToken'), false);
    assert.equal(JSON.stringify(publicAccount).includes('refreshToken'), false);
  });
});
