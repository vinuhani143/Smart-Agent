import type { Request, Response } from 'express';
import { z } from 'zod';
import { PlaylistGeneratorService } from '../ai/playlistGeneratorService';
import { AppError, ErrorCode } from '../types/errors';
import type { TrackResult } from '../types/provider';

export const generateAiPlaylistSchema = z.object({
  prompt: z.string().min(3).max(1000),
  provider: z.enum(['spotify', 'youtube', 'both']).optional(),
  destinationProvider: z.enum(['spotify', 'youtube']).optional(),
  language: z.string().max(80).optional(),
  mood: z.string().max(80).optional(),
  genre: z.string().max(80).optional(),
  theme: z.string().max(80).optional(),
  artist: z.string().max(120).optional(),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  maxTracks: z.number().int().min(1).max(100).optional(),
  allowDuplicates: z.boolean().optional(),
  explicitContent: z.boolean().optional(),
});

export const updateAiPlaylistSchema = z.object({
  title: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  trackIds: z.array(z.string().min(1)).max(100).optional(),
  addTrack: z
    .object({
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
    })
    .optional(),
});

export const createAiPlaylistSchema = z.object({
  destinationProvider: z.enum(['spotify', 'youtube']).optional(),
});

export const replaceAiTrackSchema = z.object({
  provider: z.enum(['spotify', 'youtube', 'amazon_music']),
  providerTrackId: z.string().min(1),
});

export const legacyGeneratePlaylistSchema = z.object({
  prompt: z.string().max(1000).optional(),
  language: z.string().max(80).optional(),
  mood: z.string().max(80).optional(),
  genre: z.string().max(80).optional(),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  allowDuplicates: z.boolean().optional(),
  targetProvider: z.enum(['spotify', 'youtube', 'amazon_music']).optional(),
});

function promptFromLegacy(body: z.infer<typeof legacyGeneratePlaylistSchema>): string {
  if (body.prompt && body.prompt.trim().length >= 3) {
    return body.prompt.trim();
  }
  const parts = [body.language, body.mood, body.genre, body.yearFrom && body.yearTo ? `${body.yearFrom} to ${body.yearTo}` : '', body.durationMinutes ? `${body.durationMinutes} minutes` : '']
    .filter((part): part is string => Boolean(part && String(part).length > 0));
  const prompt = parts.join(' ').trim();
  if (prompt.length < 3) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Describe the playlist you want.', 400);
  }
  return prompt;
}

export async function generateAiPlaylist(req: Request, res: Response): Promise<void> {
  const input = generateAiPlaylistSchema.parse(req.body);
  const view = await PlaylistGeneratorService.generate(req.userId!, input);
  res.json(view);
}

export async function getAiPlaylist(req: Request, res: Response): Promise<void> {
  const view = await PlaylistGeneratorService.get(req.userId!, String(req.params.id));
  res.json(view);
}

export async function updateAiPlaylist(req: Request, res: Response): Promise<void> {
  const patch = updateAiPlaylistSchema.parse(req.body);
  const view = await PlaylistGeneratorService.update(req.userId!, String(req.params.id), {
    title: patch.title,
    description: patch.description,
    trackIds: patch.trackIds,
    addTrack: patch.addTrack as TrackResult | undefined,
  });
  res.json(view);
}

export async function replaceAiPlaylistTrack(req: Request, res: Response): Promise<void> {
  const body = replaceAiTrackSchema.parse(req.body);
  const view = await PlaylistGeneratorService.replaceTrack(
    req.userId!,
    String(req.params.id),
    `${body.provider}:${body.providerTrackId}`,
  );
  res.json(view);
}

export async function createAiPlaylist(req: Request, res: Response): Promise<void> {
  const body = createAiPlaylistSchema.parse(req.body ?? {});
  const result = await PlaylistGeneratorService.createOnProvider(
    req.userId!,
    String(req.params.id),
    body.destinationProvider,
  );
  res.json(result);
}

export async function generatePlaylist(req: Request, res: Response): Promise<void> {
  const body = legacyGeneratePlaylistSchema.parse(req.body);
  const destination =
    body.targetProvider === 'spotify' || body.targetProvider === 'youtube' ? body.targetProvider : undefined;
  const view = await PlaylistGeneratorService.generate(req.userId!, {
    prompt: promptFromLegacy(body),
    language: body.language,
    mood: body.mood,
    genre: body.genre,
    yearFrom: body.yearFrom,
    yearTo: body.yearTo,
    durationMinutes: body.durationMinutes,
    allowDuplicates: body.allowDuplicates,
    destinationProvider: destination,
    provider: destination,
  });
  res.json({
    requestId: view.generationId,
    generationId: view.generationId,
    interpretation: [
      view.intent.language ? `language=${view.intent.language}` : null,
      view.intent.mood ? `mood=${view.intent.mood}` : null,
      view.intent.genre ? `genre=${view.intent.genre}` : null,
      view.intent.yearFrom || view.intent.yearTo
        ? `years=${view.intent.yearFrom ?? '?'}–${view.intent.yearTo ?? '?'}`
        : null,
      `targetMinutes=${view.intent.durationMinutes ?? 'unspecified'}`,
    ]
      .filter((part): part is string => part !== null)
      .join(', '),
    totalDurationMs: view.summary.actualDurationMinutes * 60000,
    tracks: view.playlist.tracks,
    confirmationRequired: true,
    intent: view.intent,
    playlist: view.playlist,
    summary: view.summary,
  });
}

export async function confirmGeneratedPlaylist(req: Request, res: Response): Promise<void> {
  const destination =
    req.body?.destinationProvider === 'spotify' || req.body?.destinationProvider === 'youtube'
      ? req.body.destinationProvider
      : req.body?.targetProvider === 'spotify' || req.body?.targetProvider === 'youtube'
        ? req.body.targetProvider
        : undefined;
  const result = await PlaylistGeneratorService.createOnProvider(
    req.userId!,
    String(req.params.requestId),
    destination,
  );
  res.json({ playlistId: result.playlistId, confirmationRequired: false });
}
