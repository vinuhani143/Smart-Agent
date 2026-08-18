import type { PlaylistResult, ProviderUser, TrackResult } from '../../types/provider';

export interface AmazonImage {
  url?: string;
  height?: number | null;
  width?: number | null;
  imageType?: string;
}

export interface AmazonArtist {
  id?: string;
  name?: string;
  url?: string;
}

export interface AmazonAlbum {
  id?: string;
  title?: string;
  url?: string;
}

export interface AmazonTrackNode {
  id?: string;
  title?: string;
  shortTitle?: string;
  duration?: number;
  url?: string;
  previewUrl?: string;
  isrc?: string;
  releaseDate?: string;
  album?: AmazonAlbum;
  artists?: AmazonArtist[];
  images?: AmazonImage[];
  parentalSettings?: { hasExplicitLanguage?: boolean };
}

export interface AmazonPlaylistNode {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  visibility?: string;
  trackCount?: number;
  images?: AmazonImage[];
  curator?: { id?: string };
}

export interface AmazonUserNode {
  id?: string;
  name?: string;
  handle?: string;
  images?: AmazonImage[];
  tier?: string;
  url?: string;
}

export interface AmazonEdge<T> {
  cursor?: string;
  node?: T;
}

export interface AmazonConnection<T> {
  pageInfo?: { hasNextPage?: boolean; token?: string };
  edgeCount?: number;
  edges?: Array<AmazonEdge<T>>;
}

export function playlistEntryIdFromCursor(cursor: string | undefined): string | undefined {
  if (!cursor) {
    return undefined;
  }
  const colon = cursor.indexOf(':');
  if (colon === -1) {
    return cursor;
  }
  const entryId = cursor.slice(colon + 1).trim();
  return entryId.length > 0 ? entryId : undefined;
}

function durationToMs(duration: number | undefined): number | undefined {
  if (duration === undefined || !Number.isFinite(duration) || duration < 0) {
    return undefined;
  }
  // Official track examples use seconds (e.g. 232). Values >= 1000 are treated as already ms.
  if (duration >= 1000) {
    return Math.round(duration);
  }
  return Math.round(duration * 1000);
}

function artistName(track: AmazonTrackNode): string {
  return (track.artists ?? [])
    .map((artist) => artist.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(', ');
}

export function normalizeAmazonTrack(track: AmazonTrackNode, entryId?: string): TrackResult | null {
  const id = track.id?.trim();
  const title = track.title?.trim() || track.shortTitle?.trim();
  if (!id || !title) {
    return null;
  }
  const isrc = track.isrc?.trim();
  return {
    provider: 'amazon_music',
    providerTrackId: id,
    amazonMusicId: id,
    title,
    artist: artistName(track),
    album: track.album?.title?.trim() || undefined,
    durationMs: durationToMs(track.duration),
    releaseDate: track.releaseDate,
    isrc: isrc || undefined,
    thumbnailUrl: track.images?.[0]?.url,
    url: track.url,
    previewUrl: track.previewUrl,
    explicit: track.parentalSettings?.hasExplicitLanguage,
    playlistEntryId: entryId,
  };
}

export function normalizeAmazonPlaylist(playlist: AmazonPlaylistNode): PlaylistResult | null {
  const id = playlist.id?.trim();
  const title = playlist.title?.trim();
  if (!id || !title) {
    return null;
  }
  return {
    provider: 'amazon_music',
    providerPlaylistId: id,
    name: title,
    description: playlist.description?.trim() || undefined,
    coverImageUrl: playlist.images?.[0]?.url,
    trackCount: playlist.trackCount,
    ownerName: playlist.curator?.id,
  };
}

export function normalizeAmazonUser(user: AmazonUserNode): ProviderUser | null {
  const id = user.id?.trim();
  if (!id) {
    return null;
  }
  return {
    id,
    displayName: user.name?.trim() || user.handle?.trim() || id,
    imageUrl: user.images?.[0]?.url,
    subscriptionTier: user.tier?.trim() || undefined,
  };
}

export function tracksFromPlaylistEdges(edges: Array<AmazonEdge<AmazonTrackNode>> | undefined): TrackResult[] {
  const tracks: TrackResult[] = [];
  for (const edge of edges ?? []) {
    if (!edge.node) {
      continue;
    }
    const mapped = normalizeAmazonTrack(edge.node, playlistEntryIdFromCursor(edge.cursor));
    if (mapped) {
      tracks.push(mapped);
    }
  }
  return tracks;
}

export function playlistsFromUserEdges(edges: Array<AmazonEdge<AmazonPlaylistNode>> | undefined): PlaylistResult[] {
  const playlists: PlaylistResult[] = [];
  for (const edge of edges ?? []) {
    if (!edge.node) {
      continue;
    }
    const mapped = normalizeAmazonPlaylist(edge.node);
    if (mapped) {
      playlists.push(mapped);
    }
  }
  return playlists;
}

export function createPlaylistBody(input: { name: string; description?: string; isPublic?: boolean }): {
  title: string;
  description: string;
  visibility: 'PUBLIC' | 'PRIVATE';
} {
  return {
    title: input.name,
    description: input.description ?? '',
    visibility: input.isPublic === true ? 'PUBLIC' : 'PRIVATE',
  };
}

export function addTracksBody(trackIds: string[], addDuplicateTracks = false): { trackIds: string[]; addDuplicateTracks: boolean } {
  return { trackIds, addDuplicateTracks };
}

export function removeTracksBody(entryIds: string[]): { entryIds: string[] } {
  return { entryIds };
}

export interface AmazonMoveTracksBody {
  entryIds: string[];
  entryIdAbove?: string;
  entryIdBelow?: string;
}

/**
 * Maps a Spotify-style range move onto Amazon playlist entry IDs.
 * Amazon requires playlist entry IDs, not catalog track IDs.
 */
export function moveTracksBodyFromRange(
  tracks: TrackResult[],
  input: { rangeStart: number; insertBefore: number; rangeLength?: number },
): AmazonMoveTracksBody {
  const length = input.rangeLength ?? 1;
  const moving = tracks.slice(input.rangeStart, input.rangeStart + length);
  const entryIds = moving
    .map((track) => track.playlistEntryId)
    .filter((id): id is string => Boolean(id));
  const remaining = tracks.filter((_, index) => index < input.rangeStart || index >= input.rangeStart + length);
  let insertAt = input.insertBefore;
  if (input.rangeStart < input.insertBefore) {
    insertAt = Math.max(0, input.insertBefore - length);
  }
  const above = remaining[insertAt - 1]?.playlistEntryId;
  const below = remaining[insertAt]?.playlistEntryId;
  return {
    entryIds,
    entryIdAbove: above,
    entryIdBelow: below,
  };
}
