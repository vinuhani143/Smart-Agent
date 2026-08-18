import { prisma } from '../config/prisma';
import { NoSearchResultsError, TokenInvalidError } from '../types/errors';
import type { ProviderId, SearchTracksParams, TrackResult } from '../types/provider';
import { fromPrismaProvider, getProvider } from '../providers/ProviderRegistry';
import { listConnectedProviders, withProviderTokens } from './TokenService';

export async function searchProvider(
  userId: string,
  provider: ProviderId,
  params: SearchTracksParams,
): Promise<TrackResult[]> {
  const adapter = getProvider(provider);
  if (!adapter.isEnabled()) {
    throw new TokenInvalidError(`${adapter.displayName} is not configured on this server.`);
  }
  const results = await withProviderTokens(userId, provider, (tokens) => adapter.searchTracks(tokens, params));
  if (results.length === 0) {
    throw new NoSearchResultsError(params.query);
  }
  return results;
}

export async function searchConnectedProviders(
  userId: string,
  params: SearchTracksParams,
  restrictTo?: ProviderId[],
): Promise<TrackResult[]> {
  const connected = await listConnectedProviders(userId);
  const providerIds = connected
    .map(fromPrismaProvider)
    .filter((id) => (restrictTo ? restrictTo.includes(id) : true))
    .filter((id) => getProvider(id).isEnabled());

  if (providerIds.length === 0) {
    throw new TokenInvalidError('Connect a music service in Settings before searching.');
  }

  const groups = await Promise.all(
    providerIds.map(async (provider) => {
      try {
        return await withProviderTokens(userId, provider, (tokens) =>
          getProvider(provider).searchTracks(tokens, params),
        );
      } catch {
        return [] as TrackResult[];
      }
    }),
  );

  const merged = groups.flat();
  if (merged.length === 0) {
    throw new NoSearchResultsError(params.query);
  }
  return merged;
}

export async function upsertTrack(result: TrackResult) {
  const data = {
    title: result.title,
    artist: result.artist,
    album: result.album,
    durationMs: result.durationMs,
    releaseDate: result.releaseDate ? new Date(result.releaseDate) : undefined,
    isrc: result.isrc,
    thumbnailUrl: result.thumbnailUrl,
    spotifyId: result.provider === 'spotify' ? result.providerTrackId : undefined,
    youtubeVideoId: result.provider === 'youtube' ? result.providerTrackId : undefined,
    amazonMusicId: result.provider === 'amazon_music' ? result.providerTrackId : undefined,
  };

  if (result.provider === 'spotify') {
    return prisma.track.upsert({
      where: { spotifyId: result.providerTrackId },
      create: { ...data, spotifyId: result.providerTrackId },
      update: data,
    });
  }
  if (result.provider === 'youtube') {
    return prisma.track.upsert({
      where: { youtubeVideoId: result.providerTrackId },
      create: { ...data, youtubeVideoId: result.providerTrackId },
      update: data,
    });
  }
  return prisma.track.upsert({
    where: { amazonMusicId: result.providerTrackId },
    create: { ...data, amazonMusicId: result.providerTrackId },
    update: data,
  });
}
