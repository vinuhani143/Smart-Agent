import { prisma } from '../config/prisma';
import { DuplicateTrackError, NotFoundError } from '../types/errors';
import type { ProviderId, TrackResult } from '../types/provider';
import { getProvider, toPrismaProvider } from '../providers/ProviderRegistry';
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

  const playlist = await prisma.playlist.create({
    data: {
      userId,
      name: input.name,
      description: input.description,
      coverImageUrl: input.coverImageUrl,
      sourceProvider: input.sourceProvider ? toPrismaProvider(input.sourceProvider) : undefined,
      sourcePlaylistId: input.sourcePlaylistId,
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

export async function addTrackToPlaylist(userId: string, playlistId: string, result: TrackResult) {
  const playlist = await getPlaylist(userId, playlistId);
  const existingResults: TrackResult[] = playlist.tracks.map((item) => ({
    provider: result.provider,
    providerTrackId:
      item.track.spotifyId ?? item.track.youtubeVideoId ?? item.track.amazonMusicId ?? item.track.id,
    title: item.track.title,
    artist: item.track.artist,
    album: item.track.album ?? undefined,
    durationMs: item.track.durationMs ?? undefined,
    isrc: item.track.isrc ?? undefined,
  }));
  const detector = new DuplicateDetector();
  detector.unique(existingResults);
  if (detector.has(result)) {
    throw new DuplicateTrackError();
  }
  const track = await upsertTrack(result);
  const position = playlist.tracks.length;
  await prisma.playlistTrack.create({
    data: { playlistId, trackId: track.id, position },
  });
  return getPlaylist(userId, playlistId);
}

export async function removeTrackFromPlaylist(userId: string, playlistId: string, trackId: string) {
  const playlist = await getPlaylist(userId, playlistId);
  const remaining = playlist.tracks.filter((item) => item.trackId !== trackId);
  if (remaining.length === playlist.tracks.length) {
    throw new NotFoundError('That song is not in this playlist.');
  }
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
        provider,
        providerTrackId: item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album ?? undefined,
        durationMs: item.track.durationMs ?? undefined,
        isrc: item.track.isrc ?? undefined,
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
