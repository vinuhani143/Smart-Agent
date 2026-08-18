import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveOAuthProvider } from './authController';

describe('resolveOAuthProvider', () => {
  it('maps Google and Amazon aliases to canonical provider ids', () => {
    assert.equal(resolveOAuthProvider('google'), 'youtube');
    assert.equal(resolveOAuthProvider('youtube'), 'youtube');
    assert.equal(resolveOAuthProvider('spotify'), 'spotify');
    assert.equal(resolveOAuthProvider('amazon'), 'amazon_music');
    assert.equal(resolveOAuthProvider('amazon_music'), 'amazon_music');
  });
});
