import { prisma } from '../config/prisma';
import { DuplicateTrackError, NotFoundError, ProviderUnavailableError } from '../types/errors';
import type { ProviderId, TrackResult } from '../types/provider';
import { fromPrismaProvider, getProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { DuplicateDetector } from './DuplicateDetector';
import { upsertTrack } from './SearchService';
import { requireStoredAccount, withProviderTokens } from './TokenService';
import { matchTrack } from './TrackMatcher';

export interface CreateLocalPlaylistInput {
  name: string;
  description?: string;
  coverImageUrl?: string;
  sourceProvider?: ProviderId;
  sourcePlaylistId?: string;
  targetProvider?: ProviderId;
  language?: string;
  genre?: string;
  mood?: string;
  yearFrom?: number;
  yearTo?: number;
  targetDurationMs?: number;
  tracks?: TrackResult[];
  allowDuplicates?: boolean;
}

export async function listPlaylists(userId: string) {
  return prisma.playlist.findMany({
    where: { userId },
    include: {
      tracks: {
        include: { track: true },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getPlaylist(userId: string, playlistId: string) {
  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    include: {
      tracks: {
        include: { track: true },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!playlist) {
    throw new NotFoundError();
  }
  return playlist;
}

export async function createLocalPlaylist(userId: string, input: CreateLocalPlaylistInput) {
  const uniqueTracks = input.allowDuplicates
    ? (input.tracks ?? [])
    : new DuplicateDetector().unique(input.tracks ?? []);

  let sourceProvider = input.sourceProvider;
  let sourcePlaylistId = input.sourcePlaylistId;
  let coverImageUrl = input.coverImageUrl;

  if (input.targetProvider) {
    if (input.targetProvider === 'amazon_music') {
      throw new ProviderUnavailableError(
        'amazon_music',
        'Amazon Music is not available. Official API access is not configured.',
      );
    }
    const targetProvider = input.targetProvider;
    const adapter = getProvider(targetProvider);
    const remote = await withProviderTokens(userId, targetProvider, async (tokens) => {
      const created = await adapter.createPlaylist(tokens, {
        name: input.name,
        description: input.description,
      });
      const remoteIds: string[] = [];
      for (const track of uniqueTracks) {
        const nativeId = remoteTrackIdForProvider(targetProvider, track);
        if (nativeId) {
          remoteIds.push(nativeId);
          continue;
        }
        const query = `${track.title} ${track.artist}`.trim();
        if (!query) {
          continue;
        }
        const candidates = await adapter.searchTracks(tokens, { query, limit: 5 });
        const decision = matchTrack(track, candidates);
        if (decision.best && !decision.best.needsReview) {
          remoteIds.push(decision.best.track.providerTrackId);
        }
      }
      if (remoteIds.length > 0) {
        await adapter.addTracksToPlaylist(tokens, created.providerPlaylistId, remoteIds);
      }
      return created;
    });
    sourceProvider = input.targetProvider;
    sourcePlaylistId = remote.providerPlaylistId;
    coverImageUrl = remote.coverImageUrl ?? coverImageUrl;
  }

  const playlist = await prisma.playlist.create({
    data: {
      userId,
      name: input.name,
      description: input.description,
      coverImageUrl,
      sourceProvider: sourceProvider ? toPrismaProvider(sourceProvider) : undefined,
      sourcePlaylistId,
      language: input.language,
      genre: input.genre,
      mood: input.mood,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      targetDurationMs: input.targetDurationMs,
    },
  });

  for (const [index, result] of uniqueTracks.entries()) {
    const track = await upsertTrack(result);
    await prisma.playlistTrack.create({
      data: {
        playlistId: playlist.id,
        trackId: track.id,
        position: index,
      },
    });
  }

  return getPlaylist(userId, playlist.id);
}

export async function updatePlaylist(
  userId: string,
  playlistId: string,
  input: Partial<Pick<CreateLocalPlaylistInput, 'name' | 'description' | 'coverImageUrl'>>,
) {
  await getPlaylist(userId, playlistId);
  await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      name: input.name,
      description: input.description,
      coverImageUrl: input.coverImageUrl,
    },
  });
  return getPlaylist(userId, playlistId);
}

export async function deletePlaylist(userId: string, playlistId: string): Promise<void> {
  await getPlaylist(userId, playlistId);
  await prisma.playlist.delete({ where: { id: playlistId } });
}

function remoteTrackIdForProvider(provider: ProviderId, result: TrackResult): string | undefined {
  if (provider === 'youtube') {
    return result.youtubeVideoId ?? (result.provider === 'youtube' ? result.providerTrackId : undefined);
  }
  if (provider === 'spotify') {
    return result.spotifyId ?? (result.provider === 'spotify' ? result.providerTrackId : undefined);
  }
  return undefined;
}

async function syncRemotePlaylistTrack(
  userId: string,
  playlist: Awaited<ReturnType<typeof getPlaylist>>,
  result: TrackResult,
  action: 'add' | 'remove',
): Promise<void> {
  if (!playlist.sourceProvider || !playlist.sourcePlaylistId) {
    return;
  }
  const provider = fromPrismaProvider(playlist.sourceProvider);
  const remoteId = remoteTrackIdForProvider(provider, result);
  if (!remoteId) {
    return;
  }
  const adapter = getProvider(provider);
  const remotePlaylistId = playlist.sourcePlaylistId;
  try {
    await withProviderTokens(userId, provider, async (tokens) => {
      if (action === 'add') {
        await adapter.addTracksToPlaylist(tokens, remotePlaylistId, [remoteId]);
      } else {
        await adapter.removeTracksFromPlaylist(tokens, remotePlaylistId, [remoteId]);
      }
    });
  } catch (error) {
    if (action === 'remove' && error instanceof NotFoundError) {
      return;
    }
    throw error;
  }
}

export async function addTrackToPlaylist(userId: string, playlistId: string, result: TrackResult) {
  const playlist = await getPlaylist(userId, playlistId);
  const existingResults: TrackResult[] = playlist.tracks.map((item) => ({
    provider: item.track.youtubeVideoId
      ? 'youtube'
      : item.track.spotifyId
        ? 'spotify'
        : result.provider,
    providerTrackId:
      item.track.youtubeVideoId ?? item.track.spotifyId ?? item.track.amazonMusicId ?? item.track.id,
    title: item.track.title,
    artist: item.track.artist,
    album: item.track.album ?? undefined,
    durationMs: item.track.durationMs ?? undefined,
    isrc: item.track.isrc ?? undefined,
    youtubeVideoId: item.track.youtubeVideoId ?? undefined,
    spotifyId: item.track.spotifyId ?? undefined,
  }));
  const detector = new DuplicateDetector();
  detector.unique(existingResults);
  if (detector.has(result)) {
    throw new DuplicateTrackError();
  }
  await syncRemotePlaylistTrack(userId, playlist, result, 'add');
  const track = await upsertTrack(result);
  const position = playlist.tracks.length;
  await prisma.playlistTrack.create({
    data: { playlistId, trackId: track.id, position },
  });
  return getPlaylist(userId, playlistId);
}

export async function removeTrackFromPlaylist(userId: string, playlistId: string, trackId: string) {
  const playlist = await getPlaylist(userId, playlistId);
  const removed = playlist.tracks.find((item) => item.trackId === trackId);
  const remaining = playlist.tracks.filter((item) => item.trackId !== trackId);
  if (!removed || remaining.length === playlist.tracks.length) {
    throw new NotFoundError('That song is not in this playlist.');
  }
  await syncRemotePlaylistTrack(
    userId,
    playlist,
    {
      provider: removed.track.youtubeVideoId
        ? 'youtube'
        : removed.track.spotifyId
          ? 'spotify'
          : 'youtube',
      providerTrackId:
        removed.track.youtubeVideoId ??
        removed.track.spotifyId ??
        removed.track.amazonMusicId ??
        removed.track.id,
      title: removed.track.title,
      artist: removed.track.artist,
      youtubeVideoId: removed.track.youtubeVideoId ?? undefined,
      spotifyId: removed.track.spotifyId ?? undefined,
    },
    'remove',
  );
  await prisma.$transaction([
    prisma.playlistTrack.deleteMany({ where: { playlistId, trackId } }),
    ...remaining.map((item, index) =>
      prisma.playlistTrack.update({
        where: { id: item.id },
        data: { position: index },
      }),
    ),
  ]);
  return getPlaylist(userId, playlistId);
}

export async function createPlaylistOnProvider(
  userId: string,
  playlistId: string,
  provider: ProviderId,
  confirmedTrackIds?: string[],
) {
  const playlist = await getPlaylist(userId, playlistId);
  await requireStoredAccount(userId, provider);
  const adapter = getProvider(provider);

  const created = await withProviderTokens(userId, provider, async (tokens) => {
    const remote = await adapter.createPlaylist(tokens, {
      name: playlist.name,
      description: playlist.description ?? undefined,
    });
    const chosen = confirmedTrackIds
      ? playlist.tracks.filter((item) => confirmedTrackIds.includes(item.trackId))
      : playlist.tracks;
    const remoteIds: string[] = [];
    for (const item of chosen) {
      const providerTrackId =
        provider === 'spotify'
          ? item.track.spotifyId
          : provider === 'youtube'
            ? item.track.youtubeVideoId
            : item.track.amazonMusicId;
      if (providerTrackId) {
        remoteIds.push(providerTrackId);
        continue;
      }
      const query = `${item.track.title} ${item.track.artist}`;
      const candidates = await adapter.searchTracks(tokens, { query, limit: 5 });
      const source: TrackResult = {
        provider: item.track.spotifyId ? 'spotify' : item.track.youtubeVideoId ? 'youtube' : provider,
        providerTrackId: item.track.spotifyId ?? item.track.youtubeVideoId ?? item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album ?? undefined,
        durationMs: item.track.durationMs ?? undefined,
        isrc: item.track.isrc ?? undefined,
        spotifyId: item.track.spotifyId ?? undefined,
        youtubeVideoId: item.track.youtubeVideoId ?? undefined,
      };
      const decision = matchTrack(source, candidates);
      if (decision.best && !decision.best.needsReview) {
        remoteIds.push(decision.best.track.providerTrackId);
      }
    }
    if (remoteIds.length > 0) {
      await adapter.addTracksToPlaylist(tokens, remote.providerPlaylistId, remoteIds);
    }
    return { remote, added: remoteIds.length, skipped: chosen.length - remoteIds.length };
  });

  await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      sourceProvider: toPrismaProvider(provider),
      sourcePlaylistId: created.remote.providerPlaylistId,
    },
  });

  return created;
}
