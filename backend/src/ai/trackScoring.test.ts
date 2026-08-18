import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DuplicateDetector } from '../services/DuplicateDetector';
import type { TrackResult } from '../types/provider';
import { filterScoredTracks, scoreTrack } from './trackScoring';
import type { PlaylistIntent } from './types';

function track(partial: Partial<TrackResult> & Pick<TrackResult, 'providerTrackId' | 'title'>): TrackResult {
  return {
    provider: 'spotify',
    artist: partial.artist ?? 'Artist',
    ...partial,
  };
}

const intent: PlaylistIntent = {
  language: 'Telugu',
  mood: 'romantic',
  genre: 'melody',
  yearFrom: 1995,
  yearTo: 2010,
};

describe('DuplicateDetector for AI playlists', () => {
  it('drops ISRC, provider id, and normalized title+artist duplicates', () => {
    const unique = new DuplicateDetector().unique([
      track({ providerTrackId: 'a', title: 'Song', artist: 'Singer', isrc: 'USABC1234567', spotifyId: 'a' }),
      track({ providerTrackId: 'b', title: 'Song', artist: 'Singer', isrc: 'USABC1234567', spotifyId: 'b' }),
      track({ providerTrackId: 'a', title: 'Other', artist: 'Other', spotifyId: 'a' }),
      track({ providerTrackId: 'c', title: 'Song (Official Audio)', artist: 'Singer', spotifyId: 'c' }),
    ]);
    assert.equal(unique.length, 1);
  });

  it('keeps duplicates when allowDuplicates is true', () => {
    const unique = new DuplicateDetector().unique(
      [
        track({ providerTrackId: 'a', title: 'Song', artist: 'Singer' }),
        track({ providerTrackId: 'b', title: 'Song', artist: 'Singer' }),
      ],
      true,
    );
    assert.equal(unique.length, 2);
  });
});

describe('scoreTrack', () => {
  it('scores 0–100 and does not claim a perfect language match without evidence', () => {
    const scored = scoreTrack(
      track({ providerTrackId: '1', title: 'Random Title', artist: 'Someone', releaseDate: '2001-05-01' }),
      intent,
      ['Telugu romantic songs'],
    );
    assert.ok(scored.trackScore >= 0 && scored.trackScore <= 100);
    assert.equal(scored.metadataFlags.language, 'unknown');
    assert.notEqual(scored.trackScore, 100);
    assert.equal(scored.breakdown.yearMatch, 100);
    assert.equal(scored.metadataFlags.energy, 'unknown');
    assert.equal(scored.metadataFlags.tempo, 'unknown');
  });

  it('raises language match when the title contains the language term', () => {
    const scored = scoreTrack(
      track({ providerTrackId: '1', title: 'Telugu Romantic Melody', artist: 'Singer' }),
      intent,
      ['hits'],
    );
    assert.equal(scored.metadataFlags.language, 'known');
    assert.equal(scored.breakdown.languageMatch, 100);
  });

  it('filters explicit tracks only when metadata is true and explicitContent is false', () => {
    const explicit = scoreTrack(track({ providerTrackId: 'e', title: 'X', explicit: true }), intent, []);
    const unknown = scoreTrack(track({ providerTrackId: 'u', title: 'Y' }), intent, []);
    const clean = scoreTrack(track({ providerTrackId: 'c', title: 'Z', explicit: false }), intent, []);
    const kept = filterScoredTracks([explicit, unknown, clean], { ...intent, explicitContent: false });
    assert.equal(kept.some((item) => item.track.providerTrackId === 'e'), false);
    assert.equal(kept.some((item) => item.track.providerTrackId === 'u'), true);
    assert.equal(kept.some((item) => item.track.providerTrackId === 'c'), true);
    assert.equal(unknown.metadataFlags.explicit, 'unknown');
  });

  it('drops tracks with a known year outside the requested range', () => {
    const inside = scoreTrack(
      track({ providerTrackId: 'in', title: 'In', releaseDate: '2001-01-01' }),
      intent,
      [],
    );
    const outside = scoreTrack(
      track({ providerTrackId: 'out', title: 'Out', releaseDate: '2020-01-01' }),
      intent,
      [],
    );
    const kept = filterScoredTracks([inside, outside], intent);
    assert.deepEqual(kept.map((item) => item.track.providerTrackId), ['in']);
  });
});
