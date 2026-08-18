import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseProviderId } from '../providers/ProviderRegistry';
import {
  analyzeConversion,
  confirmConversion,
  createConvertedPlaylist,
  getConversion,
} from '../services/ConversionService';
import type { TrackResult } from '../types/provider';

const providerEnum = z.enum(['spotify', 'youtube']);

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

export const analyzeConversionSchema = z.object({
  sourceProvider: providerEnum,
  sourcePlaylistId: z.string().min(1),
  destinationProvider: providerEnum,
  allowSameProvider: z.boolean().optional(),
});

export const confirmConversionSchema = z.object({
  acceptAllHighConfidence: z.boolean().optional(),
  decisions: z
    .array(
      z.object({
        sourceTrackId: z.string().min(1),
        action: z.enum(['accept', 'skip', 'select_alternative', 'manual']),
        destinationTrack: trackResultSchema.optional(),
      }),
    )
    .optional(),
});

export const createConversionSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(5000).optional(),
});

export async function analyze(req: Request, res: Response): Promise<void> {
  const body = analyzeConversionSchema.parse(req.body);
  const result = await analyzeConversion(req.userId!, {
    sourceProvider: parseProviderId(body.sourceProvider),
    sourcePlaylistId: body.sourcePlaylistId,
    destinationProvider: parseProviderId(body.destinationProvider),
    allowSameProvider: body.allowSameProvider,
  });
  res.status(201).json(result);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const result = await getConversion(req.userId!, String(req.params.id));
  res.json(result);
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const body = confirmConversionSchema.parse(req.body);
  const result = await confirmConversion(req.userId!, String(req.params.id), {
    acceptAllHighConfidence: body.acceptAllHighConfidence,
    decisions: body.decisions?.map((decision) => ({
      sourceTrackId: decision.sourceTrackId,
      action: decision.action,
      destinationTrack: decision.destinationTrack as TrackResult | undefined,
    })),
  });
  res.json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createConversionSchema.parse(req.body ?? {});
  const result = await createConvertedPlaylist(req.userId!, String(req.params.id), body);
  res.json(result);
}
