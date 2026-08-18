import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAmazonMusicLive, isAmazonMusicReady } from './amazonAvailability';

describe('Amazon availability (official API only)', () => {
  it('treats missing/disabled flags as unavailable (no fake catalog)', () => {
    assert.equal(isAmazonMusicLive(undefined), false);
    assert.equal(isAmazonMusicLive([]), false);
    assert.equal(isAmazonMusicLive([{ id: 'amazon_music', enabled: false }]), false);
    assert.equal(isAmazonMusicReady([{ id: 'amazon_music', enabled: false, connected: false }]), false);
  });

  it('is live only when the backend reports amazon_music enabled', () => {
    assert.equal(isAmazonMusicLive([{ id: 'amazon_music', enabled: true }]), true);
    assert.equal(isAmazonMusicReady([{ id: 'amazon_music', enabled: true, connected: true }]), true);
    assert.equal(isAmazonMusicReady([{ id: 'amazon_music', enabled: true, connected: false }]), false);
  });
});
