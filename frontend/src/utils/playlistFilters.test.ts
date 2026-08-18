import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterPlaylists } from './playlistFilters';
import type { PlaylistSummary } from '../types';

function playlist(overrides: Partial<PlaylistSummary>): PlaylistSummary {
  return {
    id: overrides.id ?? '1',
    name: overrides.name ?? 'Mix',
    trackCount: overrides.trackCount ?? 1,
    totalDurationMs: overrides.totalDurationMs ?? 1000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('filterPlaylists', () => {
  const items = [
    playlist({ id: 's', sourceProvider: 'SPOTIFY' }),
    playlist({ id: 'y', sourceProvider: 'youtube' }),
    playlist({ id: 'a', sourceProvider: 'AMAZON_MUSIC', aiGenerated: true }),
    playlist({ id: 'local', sourceProvider: null, aiGenerated: false }),
  ];

  it('returns all playlists for All and Created by Me', () => {
    assert.equal(filterPlaylists(items, 'all').length, 4);
    assert.equal(filterPlaylists(items, 'created_by_me').length, 4);
  });

  it('matches providers case-insensitively', () => {
    assert.deepEqual(
      filterPlaylists(items, 'spotify').map((item) => item.id),
      ['s'],
    );
    assert.deepEqual(
      filterPlaylists(items, 'youtube').map((item) => item.id),
      ['y'],
    );
    assert.deepEqual(
      filterPlaylists(items, 'amazon_music').map((item) => item.id),
      ['a'],
    );
  });

  it('filters AI generated playlists', () => {
    assert.deepEqual(
      filterPlaylists(items, 'ai_generated').map((item) => item.id),
      ['a'],
    );
  });
});
