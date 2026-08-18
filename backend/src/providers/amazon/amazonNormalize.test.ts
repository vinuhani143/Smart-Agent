import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addTracksBody,
  createPlaylistBody,
  moveTracksBodyFromRange,
  normalizeAmazonPlaylist,
  normalizeAmazonTrack,
  normalizeAmazonUser,
  playlistEntryIdFromCursor,
  removeTracksBody,
  tracksFromPlaylistEdges,
} from './amazonNormalize';
import type { TrackResult } from '../../types/provider';

const sampleTrack = {
  id: 'B0TESTTRACK01',
  title: 'Song Title',
  duration: 232,
  url: 'https://music.amazon.com/tracks/B0TESTTRACK01',
  previewUrl: 'https://music.amazon.com/preview/B0TESTTRACK01',
  isrc: 'USUM71234567',
  releaseDate: '2020-01-15',
  album: { id: 'B0TESTALBUM01', title: 'Album Title' },
  artists: [{ id: 'B0TESTARTIST', name: 'Artist Name' }],
  images: [{ url: 'https://m.media-amazon.com/images/I/example.jpg' }],
  parentalSettings: { hasExplicitLanguage: false },
};

describe('Amazon Music track normalization', () => {
  it('maps official catalog fields into the common Track model', () => {
    const track = normalizeAmazonTrack(sampleTrack);
    assert.ok(track);
    assert.equal(track.provider, 'amazon_music');
    assert.equal(track.providerTrackId, 'B0TESTTRACK01');
    assert.equal(track.amazonMusicId, 'B0TESTTRACK01');
    assert.equal(track.title, 'Song Title');
    assert.equal(track.artist, 'Artist Name');
    assert.equal(track.album, 'Album Title');
    assert.equal(track.durationMs, 232_000);
    assert.equal(track.releaseDate, '2020-01-15');
    assert.equal(track.isrc, 'USUM71234567');
    assert.equal(track.thumbnailUrl, 'https://m.media-amazon.com/images/I/example.jpg');
    assert.equal(track.url, 'https://music.amazon.com/tracks/B0TESTTRACK01');
  });

  it('does not invent an ISRC when Amazon omits one', () => {
    const { isrc: _ignored, ...withoutIsrc } = sampleTrack;
    const track = normalizeAmazonTrack(withoutIsrc);
    assert.ok(track);
    assert.equal(track.isrc, undefined);
  });

  it('does not invent a subscription tier when GET /me omits it', () => {
    const user = normalizeAmazonUser({ id: 'amzn1.account.test', name: 'Listener' });
    assert.ok(user);
    assert.equal(user.displayName, 'Listener');
    assert.equal(user.subscriptionTier, undefined);
  });

  it('stores subscription tier only when Amazon returns it', () => {
    const user = normalizeAmazonUser({ id: 'amzn1.account.test', name: 'Listener', tier: 'UNLIMITED' });
    assert.equal(user?.subscriptionTier, 'UNLIMITED');
  });
});

describe('Amazon Music playlist normalization', () => {
  it('maps playlist metadata', () => {
    const playlist = normalizeAmazonPlaylist({
      id: 'B0TESTPLAYLIST',
      title: 'Telugu Romantic',
      description: 'Private mix',
      trackCount: 12,
      visibility: 'PRIVATE',
    });
    assert.ok(playlist);
    assert.equal(playlist.provider, 'amazon_music');
    assert.equal(playlist.providerPlaylistId, 'B0TESTPLAYLIST');
    assert.equal(playlist.name, 'Telugu Romantic');
    assert.equal(playlist.trackCount, 12);
  });

  it('preserves playlist entry IDs from track cursors', () => {
    const tracks = tracksFromPlaylistEdges([
      { cursor: 'B0TESTTRACK01:entry-aaa', node: sampleTrack },
      { cursor: 'B0TESTTRACK02:entry-bbb', node: { ...sampleTrack, id: 'B0TESTTRACK02', title: 'Second' } },
    ]);
    assert.equal(playlistEntryIdFromCursor('B0TESTTRACK01:entry-aaa'), 'entry-aaa');
    assert.equal(tracks[0]?.playlistEntryId, 'entry-aaa');
    assert.equal(tracks[0]?.providerTrackId, 'B0TESTTRACK01');
    assert.notEqual(tracks[0]?.playlistEntryId, tracks[0]?.providerTrackId);
  });

  it('defaults playlist creation visibility to PRIVATE', () => {
    assert.deepEqual(createPlaylistBody({ name: 'Mine', description: 'Notes' }), {
      title: 'Mine',
      description: 'Notes',
      visibility: 'PRIVATE',
    });
  });

  it('makes a playlist public only when the caller sets isPublic', () => {
    assert.equal(createPlaylistBody({ name: 'Mine', isPublic: true }).visibility, 'PUBLIC');
  });

  it('adds catalog track IDs and removes playlist entry IDs', () => {
    assert.deepEqual(addTracksBody(['B0TESTTRACK01'], false), {
      trackIds: ['B0TESTTRACK01'],
      addDuplicateTracks: false,
    });
    assert.deepEqual(removeTracksBody(['entry-aaa']), { entryIds: ['entry-aaa'] });
  });

  it('maps a range reorder onto entry IDs, not catalog track IDs', () => {
    const tracks: TrackResult[] = [
      { provider: 'amazon_music', providerTrackId: 't1', title: 'A', artist: 'X', playlistEntryId: 'e1' },
      { provider: 'amazon_music', providerTrackId: 't2', title: 'B', artist: 'X', playlistEntryId: 'e2' },
      { provider: 'amazon_music', providerTrackId: 't3', title: 'C', artist: 'X', playlistEntryId: 'e3' },
    ];
    const body = moveTracksBodyFromRange(tracks, { rangeStart: 2, insertBefore: 0 });
    assert.deepEqual(body.entryIds, ['e3']);
    assert.equal(body.entryIdBelow, 'e1');
    assert.equal(body.entryIds.includes('t3'), false);
  });
});
