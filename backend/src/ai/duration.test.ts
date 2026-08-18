import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TrackResult } from '../types/provider';
import { selectByDuration } from './duration';
import type { ScoredTrack } from './types';

function scored(id: string, durationMs?: number, score = 80): ScoredTrack {
  const track: TrackResult = {
    provider: 'spotify',
    providerTrackId: id,
    title: `Song ${id}`,
    artist: 'Artist',
    durationMs,
  };
  return {
    track,
    trackScore: score,
    breakdown: {
      languageMatch: 50,
      genreMatch: 50,
      moodMatch: 50,
      yearMatch: 50,
      artistMatch: 50,
      metadataConfidence: 0,
      providerAvailability: 100,
    },
    metadataFlags: {
      language: 'unknown',
      genre: 'unknown',
      mood: 'unknown',
      year: 'unknown',
      explicit: 'unknown',
      energy: 'unknown',
      tempo: 'unknown',
    },
  };
}

describe('selectByDuration', () => {
  it('stops near a 120 minute target', () => {
    const ranked = Array.from({ length: 50 }, (_, index) => scored(String(index), 4 * 60 * 1000));
    const selected = selectByDuration(ranked, 120, 80);
    const minutes = selected.totalDurationMs / 60000;
    assert.ok(minutes >= 118 && minutes <= 122, `expected 118–122 minutes, got ${minutes}`);
    assert.equal(selected.tracks.length, 30);
  });

  it('does not invent duration for tracks without metadata', () => {
    const selected = selectByDuration([scored('a'), scored('b'), scored('c', 180000)], 10, 80);
    assert.equal(selected.unknownDurationCount, 2);
    assert.equal(selected.totalDurationMs, 180000);
  });

  it('caps by maxTracks when duration is omitted', () => {
    const ranked = Array.from({ length: 40 }, (_, index) => scored(String(index), 180000));
    const selected = selectByDuration(ranked, undefined, undefined);
    assert.equal(selected.tracks.length, 25);
    assert.equal(selected.targetDurationMs, 0);
  });
});
