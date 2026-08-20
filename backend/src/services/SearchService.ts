import { prisma } from '../config/prisma';
import { AppError, ErrorCode, NoSearchResultsError, TokenInvalidError, isProviderAuthError } from '../types/errors';
import type { ProviderId, SearchTracksParams, TrackResult } from '../types/provider';
import { fromPrismaProvider, getProvider } from '../providers/ProviderRegistry';
import { amazonDisabledError } from '../providers/amazon/amazonErrors';
import { executeSpotifyTrackSearch } from '../providers/spotify/SpotifyProvider';
import { isNonRetryableProviderError } from '../providers/youtube/youtubeErrors';
import { listConnectedProviders, withProviderTokens, withSpotifySearchTokens } from './TokenService';

async function searchWithTokens(
  userId: string,
  provider: ProviderId,
  params: SearchTracksParams,
): Promise<TrackResult[]> {
  if (provider === 'spotify') {
    return withSpotifySearchTokens(userId, (tokens, attempt) =>
      executeSpotifyTrackSearch(tokens, params, attempt),
    );
  }
  return withProviderTokens(userId, provider, (tokens) => getProvider(provider).searchTracks(tokens, params));
}

export async function searchProvider(
  userId: string,
  provider: ProviderId,
  params: SearchTracksParams,
): Promise<TrackResult[]> {
  const adapter = getProvider(provider);
  if (!adapter.isEnabled()) {
    if (provider === 'amazon_music') {
      throw amazonDisabledError();
    }
    throw new TokenInvalidError(`${adapter.displayName} is not configured on this server.`);
  }
  const results = await searchWithTokens(userId, provider, params);
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
    if (restrictTo?.includes('amazon_music') && !getProvider('amazon_music').isEnabled()) {
      throw amazonDisabledError();
    }
    throw new TokenInvalidError('Connect a music service in Settings before searching.');
  }

  const errors: unknown[] = [];
  const groups = await Promise.all(
    providerIds.map(async (provider) => {
      try {
        return await searchWithTokens(userId, provider, params);
      } catch (error) {
        if (restrictTo?.length === 1 || isNonRetryableProviderError(error)) {
          if (restrictTo?.length === 1) {
            throw error;
          }
        }
        errors.push(error);
        if (isNonRetryableProviderError(error) && providerIds.length === 1) {
          throw error;
        }
        return [] as TrackResult[];
      }
    }),
  );

  const merged = groups.flat();
  if (merged.length === 0) {
    const quota = errors.find((error) => isNonRetryableProviderError(error));
    if (quota) {
      throw quota;
    }
    const authError = errors.find((error) => isProviderAuthError(error));
    if (authError) {
      throw authError;
    }
    const structured = errors.find(
      (error) =>
        error instanceof AppError &&
        (error.code === ErrorCode.RATE_LIMITED || error.code === ErrorCode.SPOTIFY_SERVER_ERROR),
    );
    if (structured) {
      throw structured;
    }
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
