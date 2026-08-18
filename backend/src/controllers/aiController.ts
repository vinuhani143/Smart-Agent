import type { Request, Response } from 'express';
import { z } from 'zod';
import { PlaylistGeneratorService } from '../ai/playlistGeneratorService';
import { describeAiConfig } from '../ai/configurableLlmProvider';
import { AppError, ErrorCode } from '../types/errors';
import type { TrackResult } from '../types/provider';
import { oncePerKey } from '../utils/inFlight';
import { providerIdSchema, searchProviderSchema, trackResultSchema } from '../validation/schemas';

export const generateAiPlaylistSchema = z
  .object({
    prompt: z.string().min(3).max(1000),
    provider: searchProviderSchema.optional(),
    destinationProvider: providerIdSchema.optional(),
    language: z.string().max(80).optional(),
    mood: z.string().max(80).optional(),
    genre: z.string().max(80).optional(),
    theme: z.string().max(80).optional(),
    artist: z.string().max(120).optional(),
    yearFrom: z.number().int().min(1900).max(2100).optional(),
    yearTo: z.number().int().min(1900).max(2100).optional(),
    durationMinutes: z.number().int().min(1).max(600).optional(),
    maxTracks: z.number().int().min(1).max(50).optional(),
    allowDuplicates: z.boolean().optional(),
    explicitContent: z.boolean().optional(),
  })
  .strict();

export const updateAiPlaylistSchema = z
  .object({
    title: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
    trackIds: z.array(z.string().min(1).max(256)).max(100).optional(),
    addTrack: trackResultSchema.optional(),
  })
  .strict();

export const createAiPlaylistSchema = z
  .object({
    destinationProvider: providerIdSchema.optional(),
  })
  .strict();

export const replaceAiTrackSchema = z
  .object({
    provider: providerIdSchema,
    providerTrackId: z.string().min(1).max(128),
  })
  .strict();

export const legacyGeneratePlaylistSchema = z
  .object({
    prompt: z.string().max(1000).optional(),
    language: z.string().max(80).optional(),
    mood: z.string().max(80).optional(),
    genre: z.string().max(80).optional(),
    yearFrom: z.number().int().min(1900).max(2100).optional(),
    yearTo: z.number().int().min(1900).max(2100).optional(),
    durationMinutes: z.number().int().min(1).max(600).optional(),
    allowDuplicates: z.boolean().optional(),
    targetProvider: providerIdSchema.optional(),
  })
  .strict();

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
  const view = await oncePerKey(`ai:generate:${req.userId}:${input.prompt}`, () =>
    PlaylistGeneratorService.generate(req.userId!, input),
  );
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
  const result = await oncePerKey(`ai:create:${req.userId}:${String(req.params.id)}`, () =>
    PlaylistGeneratorService.createOnProvider(req.userId!, String(req.params.id), body.destinationProvider),
  );
  res.json(result);
}

export async function generatePlaylist(req: Request, res: Response): Promise<void> {
  const body = legacyGeneratePlaylistSchema.parse(req.body);
  const destination =
    body.targetProvider === 'spotify' ||
    body.targetProvider === 'youtube' ||
    body.targetProvider === 'amazon_music'
      ? body.targetProvider
      : undefined;
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

function asDestination(value: unknown): 'spotify' | 'youtube' | 'amazon_music' | undefined {
  if (value === 'spotify' || value === 'youtube' || value === 'amazon_music') {
    return value;
  }
  return undefined;
}

export async function confirmGeneratedPlaylist(req: Request, res: Response): Promise<void> {
  const destination = asDestination(req.body?.destinationProvider) ?? asDestination(req.body?.targetProvider);
  const result = await PlaylistGeneratorService.createOnProvider(
    req.userId!,
    String(req.params.requestId),
    destination,
  );
  res.json({ playlistId: result.playlistId, confirmationRequired: false });
}

export async function getAiStatus(_req: Request, res: Response): Promise<void> {
  res.json(describeAiConfig());
}
