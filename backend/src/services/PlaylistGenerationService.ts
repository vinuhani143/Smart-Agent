import { z } from 'zod';
import { NoSearchResultsError, TokenInvalidError } from '../types/errors';
import type { ProviderId, TrackResult } from '../types/provider';
import { DuplicateDetector } from './DuplicateDetector';
import { searchConnectedProviders } from './SearchService';

export const generatePlaylistSchema = z.object({
  prompt: z.string().max(500).optional(),
  language: z.string().max(80).optional(),
  mood: z.string().max(80).optional(),
  genre: z.string().max(80).optional(),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  allowDuplicates: z.boolean().optional().default(false),
  targetProvider: z.enum(['spotify', 'youtube', 'amazon_music']).optional(),
});

export type GeneratePlaylistInput = z.infer<typeof generatePlaylistSchema>;

export interface GeneratedPlaylistPreview {
  tracks: TrackResult[];
  totalDurationMs: number;
  filters: GeneratePlaylistInput;
  interpretation: string;
}

const YEAR_RANGE = /(\d{4})\s*(?:to|-|–|—)\s*(\d{4})/i;
const DURATION_HOURS = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i;
const DURATION_MINUTES = /(\d+)\s*(?:minutes?|mins?)/i;

export function interpretPrompt(input: GeneratePlaylistInput): GeneratePlaylistInput {
  const prompt = input.prompt ?? '';
  const next: GeneratePlaylistInput = { ...input, allowDuplicates: input.allowDuplicates ?? false };

  if (!next.yearFrom || !next.yearTo) {
    const years = YEAR_RANGE.exec(prompt);
    if (years) {
      next.yearFrom = next.yearFrom ?? Number(years[1]);
      next.yearTo = next.yearTo ?? Number(years[2]);
    }
  }

  if (next.durationMinutes === undefined) {
    const hours = DURATION_HOURS.exec(prompt);
    const minutes = DURATION_MINUTES.exec(prompt);
    if (hours) {
      next.durationMinutes = Math.round(Number(hours[1]) * 60);
    } else if (minutes) {
      next.durationMinutes = Number(minutes[1]);
    }
  }

  if (next.allowDuplicates === false && /duplicate/i.test(prompt)) {
    next.allowDuplicates = false;
  }

  const moodMatch = /(romantic|sad|happy|party|workout|chill|melancholy|energetic)/i.exec(prompt);
  if (!next.mood && moodMatch?.[1]) {
    next.mood = moodMatch[1].toLowerCase();
  }

  const genreMatch = /(melody|classical|folk|hip[- ]?hop|rock|pop|edm|jazz)/i.exec(prompt);
  if (!next.genre && genreMatch?.[1]) {
    next.genre = genreMatch[1].toLowerCase();
  }

  return next;
}

function buildQuery(input: GeneratePlaylistInput): string {
  return [input.language, input.genre, input.mood, 'songs', input.prompt]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(' ')
    .trim();
}

export async function generatePlaylistPreview(
  userId: string,
  rawInput: GeneratePlaylistInput,
  providers?: ProviderId[],
): Promise<GeneratedPlaylistPreview> {
  const filters = interpretPrompt(rawInput);
  const query = buildQuery(filters);
  if (!query) {
    throw new NoSearchResultsError('empty query');
  }

  let results: TrackResult[];
  try {
    results = await searchConnectedProviders(userId, {
      query,
      language: filters.language,
      genre: filters.genre,
      mood: filters.mood,
      yearFrom: filters.yearFrom,
      yearTo: filters.yearTo,
      limit: 50,
    }, providers);
  } catch (error) {
    if (error instanceof TokenInvalidError) {
      throw new TokenInvalidError(
        'Connect Spotify or YouTube before generating a playlist. MusicMix does not invent songs.',
      );
    }
    throw error;
  }

  const unique = new DuplicateDetector().unique(results, filters.allowDuplicates === true);
  const targetMs = (filters.durationMinutes ?? 60) * 60 * 1000;
  const selected: TrackResult[] = [];
  let total = 0;
  for (const track of unique) {
    const duration = track.durationMs ?? 180_000;
    if (total >= targetMs) {
      break;
    }
    selected.push(track);
    total += duration;
  }

  if (selected.length === 0) {
    throw new NoSearchResultsError(query);
  }

  const interpretation = [
    filters.language ? `language=${filters.language}` : null,
    filters.mood ? `mood=${filters.mood}` : null,
    filters.genre ? `genre=${filters.genre}` : null,
    filters.yearFrom || filters.yearTo ? `years=${filters.yearFrom ?? '?'}–${filters.yearTo ?? '?'}` : null,
    `targetMinutes=${filters.durationMinutes ?? 60}`,
    `allowDuplicates=${filters.allowDuplicates === true}`,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  return {
    tracks: selected,
    totalDurationMs: total,
    filters,
    interpretation,
  };
}
