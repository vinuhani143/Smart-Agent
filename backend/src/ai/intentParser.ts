import type { EnergyLevel, PlaylistIntent, TempoHint } from './types';

const YEAR_RANGE = /(\d{4})\s*(?:to|-|–|—)\s*(\d{4})/i;
const DECADE = /\b(?:the\s+)?(\d{2})s\b/i;
const DURATION_HOURS = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i;
const DURATION_MINUTES = /(\d+)\s*(?:minutes?|mins?)/i;
const MAX_TRACKS = /(\d+)\s*(?:songs?|tracks?)/i;

const LANGUAGES = [
  'telugu',
  'tamil',
  'hindi',
  'english',
  'kannada',
  'malayalam',
  'punjabi',
  'spanish',
  'korean',
  'japanese',
  'french',
  'portuguese',
];

const MOODS: Record<string, string> = {
  romantic: 'romantic',
  love: 'romantic',
  relaxing: 'relaxing',
  relax: 'relaxing',
  sad: 'sad',
  happy: 'happy',
  party: 'party',
  workout: 'workout',
  gym: 'workout',
  chill: 'chill',
  energetic: 'energetic',
  'high-energy': 'energetic',
  'high energy': 'energetic',
};

const GENRES: Array<{ needle: string; genre: string }> = [
  { needle: 'melodies', genre: 'melody' },
  { needle: 'melody', genre: 'melody' },
  { needle: 'classical', genre: 'classical' },
  { needle: 'folk', genre: 'folk' },
  { needle: 'hip hop', genre: 'hip hop' },
  { needle: 'hip-hop', genre: 'hip hop' },
  { needle: 'rock', genre: 'rock' },
  { needle: 'pop', genre: 'pop' },
  { needle: 'edm', genre: 'edm' },
  { needle: 'jazz', genre: 'jazz' },
  { needle: 'evergreen', genre: 'evergreen' },
  { needle: 'hits', genre: 'hits' },
];

const THEMES: Record<string, string> = {
  'night drive': 'night_drive',
  nightdrive: 'night_drive',
  workout: 'workout',
  gym: 'workout',
  romantic: 'romantic',
  drive: 'night_drive',
};

function containsWord(haystack: string, needle: string): boolean {
  const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return pattern.test(haystack);
}

/**
 * Pulls only facts that appear in the user's text. Does not invent metadata
 * about songs, and is not a substitute for the configured LLM.
 */
export function extractLiteralIntent(prompt: string): PlaylistIntent {
  const text = prompt.trim();
  const lower = text.toLocaleLowerCase();
  const intent: PlaylistIntent = {};

  const years = YEAR_RANGE.exec(text);
  if (years) {
    intent.yearFrom = Number(years[1]);
    intent.yearTo = Number(years[2]);
  } else {
    const decade = DECADE.exec(lower);
    if (decade?.[1]) {
      const prefix = Number(decade[1]) >= 30 ? 1900 : 2000;
      const start = prefix + Number(decade[1]);
      intent.yearFrom = start;
      intent.yearTo = start + 9;
    } else if (/\blatest\b|\brecent\b|\bnew\b/.test(lower)) {
      const year = new Date().getUTCFullYear();
      intent.yearFrom = year - 3;
      intent.yearTo = year;
    }
  }

  const hours = DURATION_HOURS.exec(lower);
  const minutes = DURATION_MINUTES.exec(lower);
  if (hours) {
    intent.durationMinutes = Math.round(Number(hours[1]) * 60);
  } else if (minutes) {
    intent.durationMinutes = Number(minutes[1]);
  }

  const trackCount = MAX_TRACKS.exec(lower);
  if (trackCount && !hours && !minutes) {
    intent.maxTracks = Number(trackCount[1]);
  }

  for (const language of LANGUAGES) {
    if (containsWord(lower, language)) {
      intent.language = language.charAt(0).toUpperCase() + language.slice(1);
      break;
    }
  }

  for (const [needle, mood] of Object.entries(MOODS)) {
    if (lower.includes(needle)) {
      intent.mood = mood;
      break;
    }
  }

  for (const { needle, genre } of GENRES) {
    if (lower.includes(needle)) {
      intent.genre = genre;
      break;
    }
  }

  for (const [needle, theme] of Object.entries(THEMES)) {
    if (lower.includes(needle)) {
      intent.theme = theme;
      break;
    }
  }

  if (/\bwithout duplicate|\bno duplicate|\bunique songs\b/.test(lower)) {
    intent.allowDuplicates = false;
  } else if (/\ballow duplicate|\bduplicates ok\b/.test(lower)) {
    intent.allowDuplicates = true;
  } else {
    intent.allowDuplicates = false;
  }

  if (/\bno explicit|\bclean\b|\bfamily friendly\b/.test(lower)) {
    intent.explicitContent = false;
  } else if (/\bexplicit\b/.test(lower)) {
    intent.explicitContent = true;
  }

  if (/\bhigh[- ]energy\b|\bworkout\b|\bgym\b/.test(lower)) {
    intent.energyLevel = 'high';
  } else if (/\brelax|\bcalm|\bsoft\b|\bnight drive\b/.test(lower)) {
    intent.energyLevel = 'low';
  }

  if (/\bslow\b|\bballad\b/.test(lower)) {
    intent.tempo = 'slow';
  } else if (/\bfast\b|\bupbeat\b/.test(lower)) {
    intent.tempo = 'fast';
  }

  const artistMatch =
    /(?:by|from)\s+([A-Z][\w.]+(?:\s+[A-Z][\w.]+){0,3})/.exec(text) ??
    /\b(ilaiyaraaja|a\.?\s*r\.?\s*rahman|ar rahman)\b/i.exec(text);
  if (artistMatch?.[1] && !LANGUAGES.includes(artistMatch[1].toLocaleLowerCase())) {
    intent.artist = artistMatch[1].replace(/\s+/g, ' ').trim();
  }

  return intent;
}

export function mergeGroundedIntent(
  prompt: string,
  literal: PlaylistIntent,
  proposed: PlaylistIntent,
): PlaylistIntent {
  const lower = prompt.toLocaleLowerCase();
  const merged: PlaylistIntent = { ...literal };

  const takeString = (key: keyof PlaylistIntent, value: string | undefined): void => {
    if (!value) {
      return;
    }
    if (literal[key]) {
      return;
    }
    if (lower.includes(value.toLocaleLowerCase())) {
      (merged as Record<string, unknown>)[key] = value;
    }
  };

  takeString('language', proposed.language);
  takeString('genre', proposed.genre);
  takeString('mood', proposed.mood);
  takeString('theme', proposed.theme);
  takeString('artist', proposed.artist);

  if (!literal.yearFrom && proposed.yearFrom && String(proposed.yearFrom) && prompt.includes(String(proposed.yearFrom))) {
    merged.yearFrom = proposed.yearFrom;
  }
  if (!literal.yearTo && proposed.yearTo && prompt.includes(String(proposed.yearTo))) {
    merged.yearTo = proposed.yearTo;
  }
  if (literal.durationMinutes === undefined && proposed.durationMinutes !== undefined) {
    if (
      prompt.includes(String(proposed.durationMinutes)) ||
      (proposed.durationMinutes % 60 === 0 && prompt.toLocaleLowerCase().includes('hour'))
    ) {
      merged.durationMinutes = proposed.durationMinutes;
    }
  }
  if (proposed.maxTracks && /songs?|tracks?/.test(lower)) {
    merged.maxTracks = proposed.maxTracks;
  }
  if (typeof proposed.allowDuplicates === 'boolean' && /duplicate/.test(lower)) {
    merged.allowDuplicates = proposed.allowDuplicates;
  }
  if (typeof proposed.explicitContent === 'boolean' && /explicit|clean|family friendly/.test(lower)) {
    merged.explicitContent = proposed.explicitContent;
  }
  if (
    !literal.energyLevel &&
    proposed.energyLevel &&
    ['low', 'medium', 'high'].includes(proposed.energyLevel) &&
    /energy|workout|gym|relax|calm|soft|night drive/.test(lower)
  ) {
    merged.energyLevel = proposed.energyLevel as EnergyLevel;
  }
  if (
    !literal.tempo &&
    proposed.tempo &&
    ['slow', 'medium', 'fast'].includes(proposed.tempo) &&
    /slow|fast|upbeat|ballad|tempo/.test(lower)
  ) {
    merged.tempo = proposed.tempo as TempoHint;
  }
  if (proposed.sourceProvider === 'spotify' || proposed.sourceProvider === 'youtube' || proposed.sourceProvider === 'amazon_music' || proposed.sourceProvider === 'both') {
    merged.sourceProvider = proposed.sourceProvider;
  }
  if (
    proposed.destinationProvider === 'spotify' ||
    proposed.destinationProvider === 'youtube' ||
    proposed.destinationProvider === 'amazon_music'
  ) {
    merged.destinationProvider = proposed.destinationProvider;
  }

  return merged;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Accepts LLM JSON without inventing fields the model omitted. */
export function intentFromUnknown(value: Record<string, unknown>): PlaylistIntent {
  const energy = asString(value.energyLevel);
  const tempo = asString(value.tempo);
  const source = asString(value.sourceProvider);
  const destination = asString(value.destinationProvider);
  return {
    language: asString(value.language),
    genre: asString(value.genre),
    mood: asString(value.mood),
    theme: asString(value.theme),
    artist: asString(value.artist),
    yearFrom: asInt(value.yearFrom),
    yearTo: asInt(value.yearTo),
    durationMinutes: asInt(value.durationMinutes),
    maxTracks: asInt(value.maxTracks),
    allowDuplicates: asBool(value.allowDuplicates),
    explicitContent: asBool(value.explicitContent),
    energyLevel: energy === 'low' || energy === 'medium' || energy === 'high' ? energy : undefined,
    tempo: tempo === 'slow' || tempo === 'medium' || tempo === 'fast' ? tempo : undefined,
    sourceProvider:
      source === 'spotify' || source === 'youtube' || source === 'amazon_music' || source === 'both' ? source : undefined,
    destinationProvider:
      destination === 'spotify' || destination === 'youtube' || destination === 'amazon_music' ? destination : undefined,
  };
}

export function applyIntentHints(base: PlaylistIntent, hints?: Partial<PlaylistIntent>): PlaylistIntent {
  if (!hints) {
    return base;
  }
  const next: PlaylistIntent = { ...base };
  for (const [key, value] of Object.entries(hints) as Array<[keyof PlaylistIntent, PlaylistIntent[keyof PlaylistIntent]]>) {
    if (value !== undefined && value !== null && value !== '') {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

export function isUnsafePlaylistPrompt(prompt: string): boolean {
  return (
    /\b(download|rip(?:ping)?|torrent|pirated?|crack(?:ed)?)\b/i.test(prompt) ||
    /\b(ignore (all )?(previous|prior) (instructions|prompts)|system prompt|you are now)\b/i.test(prompt) ||
    /\b(drop table|insert into|union select|xp_cmdshell|;--)\b/i.test(prompt) ||
    /\b(eval\s*\(|new Function\s*\(|<script|javascript:)\b/i.test(prompt)
  );
}
