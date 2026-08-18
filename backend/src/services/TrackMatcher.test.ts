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

describe('TrackMatcher Amazon Music', () => {
  function amazonTrack(title: string, artist: string, isrc?: string): TrackResult {
    return {
      provider: 'amazon_music',
      providerTrackId: 'B0AMAZON1',
      amazonMusicId: 'B0AMAZON1',
      title,
      artist,
      album: 'Album Title',
      isrc,
    };
  }

  it('matches Spotify and Amazon Music by ISRC', () => {
    const source = spotifyTrack('Song Title', 'Artist Name', 'USABC1234567');
    const candidate = amazonTrack('Different Display Title', 'Someone Else', 'US-ABC-12-34567');
    const score = scoreMatch(source, candidate);
    assert.equal(score.confidence, 99);
    assert.equal(score.reason, 'ISRC match');
    assert.equal(score.needsReview, false);
  });

  it('matches exact normalized title + artist across Amazon and Spotify', () => {
    const source = amazonTrack('Song Title', 'Artist Name');
    const candidate = spotifyTrack('Song Title', 'Artist Name');
    const score = scoreMatch(source, candidate);
    assert.equal(score.reason, 'Exact title + artist');
    assert.ok(score.confidence >= 90);
  });

  it('never auto-accepts a low-confidence Amazon fuzzy match', () => {
    const source = spotifyTrack('Midnight Rain', 'Taylor Swift');
    const candidate = amazonTrack('Cooking Playlist', 'White Noise');
    const score = scoreMatch(source, candidate);
    assert.ok(score.confidence < 90);
    assert.equal(score.needsReview, true);
  });
});
