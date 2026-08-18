import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDuplicateTrack } from './duplicates';
import type { TrackResult } from '../types';

function track(overrides: Partial<TrackResult>): TrackResult {
  return {
    provider: 'spotify',
    providerTrackId: '1',
    title: 'Song',
    artist: 'Artist',
    ...overrides,
  };
}

describe('isDuplicateTrack', () => {
  it('detects the same provider track id', () => {
    const existing = [track({ providerTrackId: 'abc' })];
    assert.equal(isDuplicateTrack(existing, track({ providerTrackId: 'abc' })), true);
  });

  it('detects matching ISRC values', () => {
    const existing = [track({ provider: 'youtube', providerTrackId: 'yt', isrc: 'US-ABC-12-34567' })];
    assert.equal(
      isDuplicateTrack(existing, track({ providerTrackId: 'sp', isrc: 'USABC1234567' })),
      true,
    );
  });

  it('detects the same title and artist', () => {
    const existing = [track({ title: 'Hello', artist: 'Adele' })];
    assert.equal(isDuplicateTrack(existing, track({ providerTrackId: '2', title: 'hello', artist: 'adele' })), true);
  });

  it('allows a different song', () => {
    const existing = [track({ title: 'Hello', artist: 'Adele' })];
    assert.equal(isDuplicateTrack(existing, track({ providerTrackId: '2', title: 'Skyfall', artist: 'Adele' })), false);
  });
});
