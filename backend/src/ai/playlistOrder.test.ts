import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TrackResult } from '../types/provider';
import { orderTracks } from './playlistOrder';
import type { ScoredTrack } from './types';

function scored(id: string, score: number): ScoredTrack {
  const track: TrackResult = {
    provider: 'youtube',
    providerTrackId: id,
    title: id,
    artist: 'Artist',
  };
  return {
    track,
    trackScore: score,
    breakdown: {
      languageMatch: 0,
      genreMatch: 0,
      moodMatch: 0,
      yearMatch: 0,
      artistMatch: 0,
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

describe('orderTracks', () => {
  it('keeps ranked order when energy/BPM metadata is unavailable', () => {
    const tracks = [scored('a', 40), scored('b', 90), scored('c', 70)];
    const ordered = orderTracks(tracks, { theme: 'workout' });
    assert.deepEqual(
      ordered.tracks.map((item) => item.track.providerTrackId),
      ['a', 'b', 'c'],
    );
    assert.equal(ordered.strategy, 'workout_requested');
    assert.match(ordered.note ?? '', /energy\/BPM metadata/i);
  });

  it('uses a romantic note without pretending to know mood curves', () => {
    const ordered = orderTracks([scored('x', 10)], { mood: 'romantic' });
    assert.equal(ordered.strategy, 'romantic_requested');
    assert.match(ordered.note ?? '', /not available/i);
  });

  it('uses night-drive note without inventing tempo', () => {
    const ordered = orderTracks([scored('x', 10)], { theme: 'night_drive' });
    assert.equal(ordered.strategy, 'night_drive_requested');
  });
});
