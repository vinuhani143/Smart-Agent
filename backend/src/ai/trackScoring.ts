import { normalizeText } from '../utils/normalize';
import type { TrackResult } from '../types/provider';
import type { PlaylistIntent, ScoredTrack } from './types';

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function yearOf(track: TrackResult): number | undefined {
  if (!track.releaseDate) {
    return undefined;
  }
  const year = new Date(track.releaseDate).getUTCFullYear();
  return Number.isFinite(year) ? year : undefined;
}

function textBlob(track: TrackResult): string {
  return normalizeText([track.title, track.artist, track.album, track.originalTitle].filter(Boolean).join(' '));
}

/**
 * Weighted fit score from available evidence only.
 * Language/genre/mood are "unknown" unless the search query or title text
 * actually contains those terms — providers rarely expose those fields.
 */
export function scoreTrack(track: TrackResult, intent: PlaylistIntent, queryTerms: string[]): ScoredTrack {
  const blob = textBlob(track);
  const queryBlob = normalizeText(queryTerms.join(' '));

  const languageKnown = Boolean(intent.language && blob.includes(normalizeText(intent.language)));
  const languageQuery = Boolean(intent.language && queryBlob.includes(normalizeText(intent.language)));
  const languageMatch = languageKnown ? 100 : languageQuery ? 55 : intent.language ? 0 : 50;

  const genreKnown = Boolean(intent.genre && blob.includes(normalizeText(intent.genre)));
  const genreQuery = Boolean(intent.genre && queryBlob.includes(normalizeText(intent.genre)));
  const genreMatch = genreKnown ? 100 : genreQuery ? 55 : intent.genre ? 0 : 50;

  const moodKnown = Boolean(intent.mood && blob.includes(normalizeText(intent.mood)));
  const moodQuery = Boolean(
    (intent.mood && queryBlob.includes(normalizeText(intent.mood))) ||
      (intent.theme && queryBlob.includes(normalizeText(intent.theme.replace('_', ' ')))),
  );
  const moodMatch = moodKnown ? 100 : moodQuery ? 55 : intent.mood ? 0 : 50;

  const year = yearOf(track);
  let yearMatch = 50;
  let yearFlag: 'known' | 'unknown' = 'unknown';
  if (year !== undefined) {
    yearFlag = 'known';
    if (intent.yearFrom !== undefined && intent.yearTo !== undefined) {
      yearMatch = year >= intent.yearFrom && year <= intent.yearTo ? 100 : 10;
    } else if (intent.yearFrom !== undefined) {
      yearMatch = year >= intent.yearFrom ? 90 : 20;
    }
  } else if (intent.yearFrom || intent.yearTo) {
    yearMatch = queryBlob.match(/\b(19|20)\d{2}\b/) ? 40 : 0;
  }

  const artistMatch = intent.artist
    ? blob.includes(normalizeText(intent.artist))
      ? 100
      : 0
    : 50;

  const metadataConfidence = [languageKnown, genreKnown, moodKnown, yearFlag === 'known'].filter(Boolean).length * 25;
  const providerAvailability = track.provider === 'spotify' || track.provider === 'youtube' ? 100 : 0;

  const trackScore = clamp(
    languageMatch * 0.18 +
      genreMatch * 0.16 +
      moodMatch * 0.16 +
      yearMatch * 0.2 +
      artistMatch * 0.16 +
      metadataConfidence * 0.08 +
      providerAvailability * 0.06,
  );

  return {
    track,
    trackScore,
    breakdown: {
      languageMatch,
      genreMatch,
      moodMatch,
      yearMatch,
      artistMatch,
      metadataConfidence,
      providerAvailability,
    },
    metadataFlags: {
      language: languageKnown ? 'known' : 'unknown',
      genre: genreKnown ? 'known' : 'unknown',
      mood: moodKnown ? 'known' : 'unknown',
      year: yearFlag,
      explicit: track.explicit === undefined ? 'unknown' : 'known',
      energy: 'unknown',
      tempo: 'unknown',
    },
  };
}

export function filterScoredTracks(tracks: ScoredTrack[], intent: PlaylistIntent): ScoredTrack[] {
  return tracks.filter((item) => {
    if (intent.explicitContent === false && item.track.explicit === true) {
      return false;
    }
    const year = yearOf(item.track);
    if (year !== undefined && intent.yearFrom !== undefined && intent.yearTo !== undefined) {
      if (year < intent.yearFrom || year > intent.yearTo) {
        return false;
      }
    }
    return true;
  });
}
