import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { parseProviderId } from '../providers/ProviderRegistry';
import {
  addTrackToPlaylist,
  createLocalPlaylist,
  createPlaylistOnProvider,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removeTrackFromPlaylist,
  updatePlaylist,
} from '../services/PlaylistService';
import { getProvider } from '../providers/ProviderRegistry';
import { requireStoredAccount, withProviderTokens } from '../services/TokenService';
import { matchTrack } from '../services/TrackMatcher';
import type { TrackResult } from '../types/provider';

const trackResultSchema = z.object({
  provider: z.enum(['spotify', 'youtube', 'amazon_music']),
  providerTrackId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().optional(),
  durationMs: z.number().int().optional(),
  releaseDate: z.string().optional(),
  isrc: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  explicit: z.boolean().optional(),
  originalTitle: z.string().optional(),
  metadataConfidence: z.number().optional(),
  parsedTitle: z.string().optional(),
  parsedArtist: z.string().optional(),
  youtubeVideoId: z.string().optional(),
  spotifyId: z.string().optional(),
});

export const createPlaylistSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  coverImageUrl: z.string().url().optional(),
  language: z.string().optional(),
  genre: z.string().optional(),
  mood: z.string().optional(),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
  targetDurationMs: z.number().int().optional(),
  tracks: z.array(trackResultSchema).optional(),
  allowDuplicates: z.boolean().optional(),
  targetProvider: z.enum(['spotify', 'youtube', 'amazon_music']).optional(),
});

export const updatePlaylistSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  coverImageUrl: z.string().url().optional(),
});

export const addTrackSchema = z.object({
  track: trackResultSchema,
});

export const createOnProviderSchema = z.object({
  provider: z.enum(['spotify', 'youtube', 'amazon_music']),
  confirmedTrackIds: z.array(z.string()).optional(),
});

export const convertSchema = z.object({
  sourcePlaylistId: z.string().min(1),
  destinationProvider: z.enum(['spotify', 'youtube', 'amazon_music']),
});

export async function list(req: Request, res: Response): Promise<void> {
  const playlists = await listPlaylists(req.userId!);
  const generated = await prisma.playlistGeneration.findMany({
    where: { userId: req.userId!, resultPlaylistId: { not: null } },
    select: { resultPlaylistId: true },
  });
  const aiIds = new Set(generated.map((row) => row.resultPlaylistId));
  res.json({
    playlists: playlists.map((playlist) => ({
      ...serializePlaylist(playlist),
      aiGenerated: aiIds.has(playlist.id),
    })),
  });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createPlaylistSchema.parse(req.body);
  const playlist = await createLocalPlaylist(req.userId!, body);
  res.status(201).json({ playlist: serializePlaylist(playlist) });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const playlist = await getPlaylist(req.userId!, String(req.params.id));
  res.json({ playlist: serializePlaylist(playlist) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = updatePlaylistSchema.parse(req.body);
  const playlist = await updatePlaylist(req.userId!, String(req.params.id), body);
  res.json({ playlist: serializePlaylist(playlist) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await deletePlaylist(req.userId!, String(req.params.id));
  res.status(204).send();
}

export async function addTrack(req: Request, res: Response): Promise<void> {
  const body = addTrackSchema.parse(req.body);
  const playlist = await addTrackToPlaylist(req.userId!, String(req.params.id), body.track);
  res.json({ playlist: serializePlaylist(playlist) });
}

export async function removeTrack(req: Request, res: Response): Promise<void> {
  const playlist = await removeTrackFromPlaylist(
    req.userId!,
    String(req.params.id),
    String(req.params.trackId),
  );
  res.json({ playlist: serializePlaylist(playlist) });
}

export async function createOnProvider(req: Request, res: Response): Promise<void> {
  const body = createOnProviderSchema.parse(req.body);
  const result = await createPlaylistOnProvider(
    req.userId!,
    String(req.params.id),
    body.provider,
    body.confirmedTrackIds,
  );
  res.json({
    providerPlaylist: result.remote,
    added: result.added,
    skipped: result.skipped,
  });
}

export async function convertPreview(req: Request, res: Response): Promise<void> {
  const body = convertSchema.parse(req.body);
  const playlist = await getPlaylist(req.userId!, body.sourcePlaylistId);
  const destination = parseProviderId(body.destinationProvider);
  await requireStoredAccount(req.userId!, destination);
  const adapter = getProvider(destination);

  const matches = await withProviderTokens(req.userId!, destination, async (tokens) => {
    const decisions = [];
    for (const item of playlist.tracks) {
      const source: TrackResult = {
        provider: item.track.spotifyId ? 'spotify' : item.track.youtubeVideoId ? 'youtube' : destination,
        providerTrackId: item.track.spotifyId ?? item.track.youtubeVideoId ?? item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album ?? undefined,
        durationMs: item.track.durationMs ?? undefined,
        isrc: item.track.isrc ?? undefined,
        thumbnailUrl: item.track.thumbnailUrl ?? undefined,
        spotifyId: item.track.spotifyId ?? undefined,
        youtubeVideoId: item.track.youtubeVideoId ?? undefined,
      };
      const candidates = await adapter.searchTracks(tokens, {
        query: `${item.track.title} ${item.track.artist}`,
        limit: 5,
      });
      decisions.push(matchTrack(source, candidates));
    }
    return decisions;
  });

  res.json({
    sourcePlaylistId: playlist.id,
    destinationProvider: destination,
    matches: matches.map((decision) => ({
      source: decision.source,
      best: decision.best
        ? {
            track: decision.best.track,
            confidence: decision.best.confidence,
            reason: decision.best.reason,
            needsReview: decision.best.needsReview,
          }
        : null,
      alternatives: decision.alternatives.map((alt) => ({
        track: alt.track,
        confidence: alt.confidence,
        reason: alt.reason,
        needsReview: true,
      })),
    })),
  });
}

function serializePlaylist(
  playlist: Awaited<ReturnType<typeof getPlaylist>>,
): Record<string, unknown> {
  const totalDurationMs = playlist.tracks.reduce(
    (sum, item) => sum + (item.track.durationMs ?? 0),
    0,
  );
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    coverImageUrl: playlist.coverImageUrl,
    sourceProvider: playlist.sourceProvider,
    sourcePlaylistId: playlist.sourcePlaylistId,
    language: playlist.language,
    genre: playlist.genre,
    mood: playlist.mood,
    yearFrom: playlist.yearFrom,
    yearTo: playlist.yearTo,
    trackCount: playlist.tracks.length,
    totalDurationMs,
    tracks: playlist.tracks.map((item) => ({
      id: item.track.id,
      position: item.position,
      title: item.track.title,
      artist: item.track.artist,
      album: item.track.album,
      durationMs: item.track.durationMs,
      thumbnailUrl: item.track.thumbnailUrl,
      isrc: item.track.isrc,
      spotifyId: item.track.spotifyId,
      youtubeVideoId: item.track.youtubeVideoId,
      amazonMusicId: item.track.amazonMusicId,
    })),
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };
}
