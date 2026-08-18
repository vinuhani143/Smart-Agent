import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseYouTubeTitle } from '../providers/youtube/parseYouTubeTitle';
import { scoreMatch } from './TrackMatcher';
import type { TrackResult } from '../types/provider';

function spotifyTrack(title: string, artist: string, isrc?: string): TrackResult {
  return {
    provider: 'spotify',
    providerTrackId: 'sp1',
    title,
    artist,
    isrc,
    spotifyId: 'sp1',
  };
}

function youtubeTrack(rawTitle: string, channel: string, videoId = 'yt1'): TrackResult {
  const parsed = parseYouTubeTitle(rawTitle, channel);
  return {
    provider: 'youtube',
    providerTrackId: videoId,
    youtubeVideoId: videoId,
    title: parsed.title,
    artist: parsed.artist,
    originalTitle: parsed.originalTitle,
    metadataConfidence: parsed.confidence,
    parsedTitle: parsed.parsedTitle,
    parsedArtist: parsed.parsedArtist,
  };
}

describe('TrackMatcher Spotify → YouTube', () => {
  it('scores an official-audio YouTube title at 96%', () => {
    const source = spotifyTrack('Song Name', 'Artist Name');
    const candidate = youtubeTrack('Artist Name - Song Name (Official Audio)', 'Artist Name');
    const score = scoreMatch(source, candidate);
    assert.equal(score.confidence, 96);
    assert.equal(score.needsReview, false);
    assert.equal(score.reason, 'Exact title + artist');
  });

  it('uses ISRC when both sides have it', () => {
    const source = spotifyTrack('A', 'B', 'USABC1234567');
    const candidate = { ...youtubeTrack('unrelated title', 'channel'), isrc: 'US-ABC-12-34567' };
    const score = scoreMatch(source, candidate);
    assert.equal(score.confidence, 99);
    assert.equal(score.reason, 'ISRC match');
  });

  it('marks low-confidence fuzzy matches for review', () => {
    const source = spotifyTrack('Midnight Rain', 'Taylor Swift');
    const candidate = youtubeTrack('Cooking with rain sounds 10 hours', 'White Noise');
    const score = scoreMatch(source, candidate);
    assert.ok(score.confidence < 90);
    assert.equal(score.needsReview, true);
  });
});
