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
  reorderPlaylistTracks,
  updatePlaylist,
} from '../services/PlaylistService';
import { withIdempotency } from '../services/IdempotencyService';
import { getProvider } from '../providers/ProviderRegistry';
import { requireStoredAccount, withProviderTokens } from '../services/TokenService';
import { matchTrack } from '../services/TrackMatcher';
import { oncePerKey } from '../utils/inFlight';
import type { TrackResult } from '../types/provider';
import { providerIdSchema, trackResultSchema } from '../validation/schemas';

export const createPlaylistSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    coverImageUrl: z.string().url().max(2000).optional(),
    language: z.string().max(80).optional(),
    genre: z.string().max(80).optional(),
    mood: z.string().max(80).optional(),
    yearFrom: z.number().int().min(1900).max(2100).optional(),
    yearTo: z.number().int().min(1900).max(2100).optional(),
    targetDurationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    tracks: z.array(trackResultSchema).max(200).optional(),
    allowDuplicates: z.boolean().optional(),
    targetProvider: providerIdSchema.optional(),
  })
  .strict();

export const updatePlaylistSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    coverImageUrl: z.string().url().max(2000).optional(),
  })
  .strict();

export const addTrackSchema = z.object({
  track: trackResultSchema,
}).strict();

export const createOnProviderSchema = z
  .object({
    provider: providerIdSchema,
    confirmedTrackIds: z.array(z.string().min(1).max(128)).max(200).optional(),
  })
  .strict();

export const convertSchema = z
  .object({
    sourcePlaylistId: z.string().min(1).max(128),
    destinationProvider: providerIdSchema,
  })
  .strict();

export async function list(req: Request, res: Response): Promise<void> {
  const playlists = await listPlaylists(req.userId!);
  const generated = await prisma.playlistGeneration.findMany({
    where: { userId: req.userId!, resultPlaylistId: { not: null } },
    select: { resultPlaylistId: true },
  });
  const aiIds = new Set(generated.map((row) => row.resultPlaylistId));
  res.json({
    playlists: playlists.map((playlist) => ({
      ...serializePlaylistSummary(playlist),
      aiGenerated: aiIds.has(playlist.id),
    })),
  });
}

export const reorderTracksSchema = z
  .object({
    trackIds: z.array(z.string().min(1).max(128)).min(1).max(500),
  })
  .strict();

export async function create(req: Request, res: Response): Promise<void> {
  const body = createPlaylistSchema.parse(req.body);
  await withIdempotency(req, res, req.userId!, async () => {
    const playlist = await oncePerKey(`playlist:create:${req.userId}:${body.name}`, () =>
      createLocalPlaylist(req.userId!, body),
    );
    return { status: 201, body: { playlist: serializePlaylist(playlist) } };
  });
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
  const track = body.track;
  const playlist = await oncePerKey(
    `playlist:add:${req.userId}:${String(req.params.id)}:${track.provider}:${track.providerTrackId}`,
    () => addTrackToPlaylist(req.userId!, String(req.params.id), track),
  );
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

export async function reorderTracks(req: Request, res: Response): Promise<void> {
  const body = reorderTracksSchema.parse(req.body);
  const playlist = await reorderPlaylistTracks(req.userId!, String(req.params.id), body.trackIds);
  res.json({ playlist: serializePlaylist(playlist) });
}

export async function createOnProvider(req: Request, res: Response): Promise<void> {
  const body = createOnProviderSchema.parse(req.body);
  await withIdempotency(req, res, req.userId!, async () => {
    const result = await oncePerKey(
      `playlist:create-on-provider:${req.userId}:${String(req.params.id)}:${body.provider}`,
      () => createPlaylistOnProvider(req.userId!, String(req.params.id), body.provider, body.confirmedTrackIds),
    );
    return {
      status: 200,
      body: {
        providerPlaylist: result.remote,
        added: result.added,
        skipped: result.skipped,
      },
    };
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

function serializePlaylistSummary(
  playlist: Awaited<ReturnType<typeof listPlaylists>>[number],
): Record<string, unknown> {
  const totalDurationMs = playlist.tracks.reduce((sum, entry) => sum + (entry.track.durationMs ?? 0), 0);
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
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };
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
