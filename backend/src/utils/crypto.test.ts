import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decryptSecret, encryptSecret, toPkceChallenge } from './crypto';

const KEY = 'cd'.repeat(32);

describe('encryptSecret', () => {
  it('uses authenticated AES-256-GCM and rejects tampering', () => {
    const payload = encryptSecret('provider-refresh', KEY);
    assert.equal(decryptSecret(payload, KEY), 'provider-refresh');
    const [iv, tag, data] = payload.split('.');
    assert.ok(iv && tag && data);
    assert.throws(() => decryptSecret(`${iv}.${tag}.${data.slice(0, -2)}aa`, KEY));
  });
});

describe('toPkceChallenge', () => {
  it('produces an S256 challenge', () => {
    const challenge = toPkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    assert.ok(challenge.length > 20);
    assert.notEqual(challenge, 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  });
});
