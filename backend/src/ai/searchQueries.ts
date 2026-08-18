import type { PlaylistIntent } from './types';

const MAX_QUERIES = 6;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

/**
 * Builds a small set of official-API search queries from an intent.
 * Caps the list so we never fire unbounded provider requests.
 */
export function buildSearchQueries(intent: PlaylistIntent, prompt: string): string[] {
  const language = intent.language ?? '';
  const genre = intent.genre ?? '';
  const mood = intent.mood ?? '';
  const artist = intent.artist ?? '';
  const theme = intent.theme?.replace('_', ' ') ?? '';
  const midYear =
    intent.yearFrom !== undefined && intent.yearTo !== undefined
      ? Math.round((intent.yearFrom + intent.yearTo) / 2)
      : undefined;

  const queries: string[] = [];
  if (artist) {
    queries.push([artist, language, genre, mood, 'songs'].filter(Boolean).join(' '));
  }
  queries.push([language, mood, genre, 'songs'].filter(Boolean).join(' '));
  if (mood && genre && mood !== genre) {
    queries.push([language, mood, 'songs'].filter(Boolean).join(' '));
    queries.push([language, genre, 'songs'].filter(Boolean).join(' '));
  }
  if (theme && theme !== mood) {
    queries.push([language, theme, 'songs'].filter(Boolean).join(' '));
  }
  if (intent.yearFrom) {
    queries.push([language, mood || genre, 'songs', String(intent.yearFrom)].filter(Boolean).join(' '));
  }
  if (midYear && midYear !== intent.yearFrom) {
    queries.push([language, genre || mood, String(midYear)].filter(Boolean).join(' '));
  }
  if (intent.yearTo && intent.yearTo !== intent.yearFrom) {
    queries.push([language, mood || genre, String(intent.yearTo)].filter(Boolean).join(' '));
  }
  if (prompt.trim().length > 0) {
    queries.push(prompt.trim().slice(0, 120));
  }

  const cleaned = unique(queries.filter((query) => query.replace(/\bsongs\b/gi, '').trim().length > 0));
  return cleaned.slice(0, MAX_QUERIES);
}
