import type { Request, Response } from 'express';
import { parseProviderId } from '../providers/ProviderRegistry';
import { searchConnectedProviders, searchProvider } from '../services/SearchService';
import { searchQuerySchema } from '../validation/schemas';

function parseSearch(req: Request) {
  return searchQuerySchema.parse(req.query);
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
    offset: query.offset,
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
    offset: query.offset,
  });
  res.json({ tracks, provider });
}
