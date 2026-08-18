import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseProviderId } from '../providers/ProviderRegistry';
import {
  analyzeConversion,
  confirmConversion,
  createConvertedPlaylist,
  getConversion,
} from '../services/ConversionService';
import { oncePerKey } from '../utils/inFlight';
import type { TrackResult } from '../types/provider';
import { providerIdSchema, trackResultSchema } from '../validation/schemas';

export const analyzeConversionSchema = z
  .object({
    sourceProvider: providerIdSchema,
    sourcePlaylistId: z.string().min(1).max(128),
    destinationProvider: providerIdSchema,
    allowSameProvider: z.boolean().optional(),
  })
  .strict();

export const confirmConversionSchema = z
  .object({
    acceptAllHighConfidence: z.boolean().optional(),
    decisions: z
      .array(
        z.object({
          sourceTrackId: z.string().min(1).max(256),
          action: z.enum(['accept', 'skip', 'select_alternative', 'manual']),
          destinationTrack: trackResultSchema.optional(),
        }),
      )
      .max(500)
      .optional(),
  })
  .strict();

export const createConversionSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(5000).optional(),
  })
  .strict();

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
  const result = await oncePerKey(`conversion:create:${req.userId}:${String(req.params.id)}`, () =>
    createConvertedPlaylist(req.userId!, String(req.params.id), body),
  );
  res.json(result);
}
