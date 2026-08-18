import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DuplicateDetector } from './DuplicateDetector';
import type { TrackResult } from '../types/provider';

function yt(id: string, title: string, artist: string): TrackResult {
  return {
    provider: 'youtube',
    providerTrackId: id,
    youtubeVideoId: id,
    title,
    artist,
    parsedTitle: title,
    parsedArtist: artist,
  };
}

describe('DuplicateDetector', () => {
  it('rejects the same YouTube video id twice', () => {
    const detector = new DuplicateDetector();
    detector.add(yt('abc', 'Song', 'Artist'));
    assert.equal(detector.has(yt('abc', 'Different title', 'Someone')), true);
  });

  it('detects normalized title + artist when video ids differ', () => {
    const detector = new DuplicateDetector();
    detector.add(yt('aaa', 'Song Name (Official Audio)', 'Artist Name'));
    assert.equal(detector.has(yt('bbb', 'Song Name', 'Artist Name')), true);
  });

  it('keeps distinct songs', () => {
    const unique = new DuplicateDetector().unique([
      yt('a', 'Song A', 'Artist'),
      yt('b', 'Song B', 'Artist'),
    ]);
    assert.equal(unique.length, 2);
  });
});
