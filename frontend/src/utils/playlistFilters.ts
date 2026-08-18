import type { PlaylistSummary } from '@/types';

export type PlaylistLibraryFilter =
  | 'all'
  | 'spotify'
  | 'youtube'
  | 'amazon_music'
  | 'created_by_me'
  | 'ai_generated';

export function filterPlaylists(
  playlists: PlaylistSummary[],
  filter: PlaylistLibraryFilter,
): PlaylistSummary[] {
  if (filter === 'all' || filter === 'created_by_me') {
    return playlists;
  }
  if (filter === 'ai_generated') {
    return playlists.filter((playlist) => playlist.aiGenerated === true);
  }
  return playlists.filter(
    (playlist) => (playlist.sourceProvider ?? '').toLowerCase() === filter,
  );
}
