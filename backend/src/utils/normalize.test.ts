import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeText, normalizeTrackIdentity, stripFeatureCredits } from './normalize';

describe('normalization', () => {
  it('lowercases, strips punctuation, and collapses spaces', () => {
    assert.equal(normalizeText('  Song-Name!!  '), 'song name');
  });

  it('strips feat / featuring / ft credits from artist-side titles', () => {
    assert.equal(stripFeatureCredits('Song Name feat. Other'), 'Song Name');
    assert.equal(stripFeatureCredits('Song Name featuring Other'), 'Song Name');
    assert.equal(stripFeatureCredits('Song Name ft. Other'), 'Song Name');
  });

  it('strips official audio/video and lyrics wrappers', () => {
    const identity = normalizeTrackIdentity('Song Name (Official Audio)', 'Artist Name');
    assert.equal(identity.title, 'song name');
    assert.equal(identity.artist, 'artist name');
  });

  it('strips remaster, radio edit, and extended mix suffixes', () => {
    assert.equal(normalizeTrackIdentity('Song Name - Remastered', 'Artist').title, 'song name');
    assert.equal(normalizeTrackIdentity('Song Name (Radio Edit)', 'Artist').title, 'song name');
    assert.equal(normalizeTrackIdentity('Song Name (Extended Mix)', 'Artist').title, 'song name');
  });

  it('does not remove meaningful title words such as Version of Me', () => {
    const identity = normalizeTrackIdentity('Version of Me', 'Artist');
    assert.equal(identity.title, 'version of me');
  });

  it('keeps the original title on the identity object', () => {
    const identity = normalizeTrackIdentity('Song Name (Official Video)', 'Artist');
    assert.equal(identity.rawTitle, 'Song Name (Official Video)');
  });

  it('treats live/acoustic in parentheses as a variant without destroying the core title', () => {
    const identity = normalizeTrackIdentity('Song Name (Live)', 'Artist');
    assert.equal(identity.title, 'song name');
    assert.equal(identity.strippedRemixOrLive, true);
  });
});
