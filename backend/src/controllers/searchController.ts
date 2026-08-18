import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseProviderId } from '../providers/ProviderRegistry';
import { searchConnectedProviders, searchProvider } from '../services/SearchService';
import { AppError, ErrorCode } from '../types/errors';

const searchQuery = z.object({
  q: z.string().min(1, 'Enter a search term.'),
  language: z.string().optional(),
  genre: z.string().optional(),
  mood: z.string().optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  durationMinMs: z.coerce.number().int().optional(),
  durationMaxMs: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function parseSearch(req: Request) {
  const parsed = searchQuery.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Enter a search term.', 400);
  }
  return parsed.data;
}

export async function searchAll(req: Request, res: Response): Promise<void> {
  const userId = req.userId!;
  const query = parseSearch(req);
  const tracks = await searchConnectedProviders(userId, {
    query: query.q,
    language: query.language,
    genre: query.genre,
    mood: query.mood,
    yearFrom: query.yearFrom,
    yearTo: query.yearTo,
    durationMinMs: query.durationMinMs,
    durationMaxMs: query.durationMaxMs,
    limit: query.limit,
  });
  res.json({ tracks });
}

export async function searchOne(req: Request, res: Response): Promise<void> {
  const userId = req.userId!;
  const provider = parseProviderId(String(req.params.provider));
  const query = parseSearch(req);
  const tracks = await searchProvider(userId, provider, {
    query: query.q,
    language: query.language,
    genre: query.genre,
    mood: query.mood,
    yearFrom: query.yearFrom,
    yearTo: query.yearTo,
    durationMinMs: query.durationMinMs,
    durationMaxMs: query.durationMaxMs,
    limit: query.limit,
  });
  res.json({ tracks, provider });
}
