import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseYouTubeTitle, stripYouTubeNoise } from './parseYouTubeTitle';

describe('parseYouTubeTitle', () => {
  it('extracts artist and song from "Artist - Song (Official Audio)"', () => {
    const parsed = parseYouTubeTitle('Artist Name - Song Name (Official Audio)', 'Artist Name');
    assert.equal(parsed.parsedArtist, 'Artist Name');
    assert.equal(parsed.parsedTitle, 'Song Name');
    assert.equal(parsed.confidence, 96);
    assert.equal(parsed.strategy, 'artist-dash-song');
    assert.equal(parsed.title, 'Song Name');
    assert.equal(parsed.artist, 'Artist Name');
  });

  it('extracts song then artist from "Song (Official Video) - Artist"', () => {
    const parsed = parseYouTubeTitle('Song Name (Official Video) - Artist Name', 'Artist Name');
    assert.equal(parsed.parsedTitle, 'Song Name');
    assert.equal(parsed.parsedArtist, 'Artist Name');
    assert.equal(parsed.confidence, 94);
    assert.equal(parsed.strategy, 'song-dash-artist');
  });

  it('parses "Song | Artist"', () => {
    const parsed = parseYouTubeTitle('Song Name | Artist Name', 'Artist Name');
    assert.equal(parsed.parsedTitle, 'Song Name');
    assert.equal(parsed.parsedArtist, 'Artist Name');
    assert.ok(parsed.confidence >= 90);
  });

  it('matches VEVO channels to the artist', () => {
    const parsed = parseYouTubeTitle('Artist Name - Song Name', 'ArtistNameVEVO');
    assert.equal(parsed.parsedTitle, 'Song Name');
    assert.equal(parsed.parsedArtist, 'Artist Name');
    assert.equal(parsed.confidence, 96);
  });

  it('keeps the original title when confidence is low', () => {
    const raw = 'Live concert highlights 2010 Mumbai';
    const parsed = parseYouTubeTitle(raw, 'Random Channel');
    assert.ok(parsed.confidence < 80);
    assert.equal(parsed.title, raw);
    assert.equal(parsed.artist, 'Random Channel');
    assert.equal(parsed.originalTitle, raw);
  });

  it('does not treat the entire raw title as the song when a dash split is uncertain', () => {
    const parsed = parseYouTubeTitle('Something - Something else extra long unexplained', 'Unrelated');
    assert.ok(parsed.confidence < 80);
    assert.equal(parsed.title, 'Something - Something else extra long unexplained');
    assert.ok(parsed.parsedTitle);
    assert.ok(parsed.parsedArtist);
  });

  it('strips official-video noise', () => {
    assert.equal(stripYouTubeNoise('Song (Official Video)'), 'Song');
  });
});
