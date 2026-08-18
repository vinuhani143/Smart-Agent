import { stringSimilarity } from '../utils/fuzzy';
import { normalizeTrackIdentity } from '../utils/normalize';
import type { TrackResult } from '../types/provider';

export const LOW_CONFIDENCE_THRESHOLD = 80;

export interface MatchScore {
  track: TrackResult;
  confidence: number;
  reason: string;
  needsReview: boolean;
}

export interface MatchDecision {
  source: TrackResult;
  best: MatchScore | null;
  alternatives: MatchScore[];
}

function isrcEqual(a?: string, b?: string): boolean {
  if (!a || !b) {
    return false;
  }
  return a.replace(/[\s-]/g, '').toUpperCase() === b.replace(/[\s-]/g, '').toUpperCase();
}

function providerIdEqual(source: TrackResult, candidate: TrackResult): boolean {
  if (source.provider === candidate.provider && source.providerTrackId === candidate.providerTrackId) {
    return true;
  }
  return false;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreMatch(source: TrackResult, candidate: TrackResult): MatchScore {
  if (providerIdEqual(source, candidate)) {
    return {
      track: candidate,
      confidence: 100,
      reason: 'Same provider track id',
      needsReview: false,
    };
  }

  if (isrcEqual(source.isrc, candidate.isrc)) {
    return {
      track: candidate,
      confidence: 99,
      reason: 'ISRC match',
      needsReview: false,
    };
  }

  const sourceNorm = normalizeTrackIdentity(source.title, source.artist, source.album);
  const candidateNorm = normalizeTrackIdentity(candidate.title, candidate.artist, candidate.album);

  if (
    sourceNorm.title === candidateNorm.title &&
    sourceNorm.artist === candidateNorm.artist &&
    sourceNorm.title.length > 0
  ) {
    const penalty =
      sourceNorm.strippedRemixOrLive || candidateNorm.strippedRemixOrLive ? 8 : 0;
    const confidence = clampConfidence(96 - penalty);
    return {
      track: candidate,
      confidence,
      reason: 'Exact title + artist',
      needsReview: confidence < LOW_CONFIDENCE_THRESHOLD,
    };
  }

  const titleSim = stringSimilarity(sourceNorm.title, candidateNorm.title);
  const artistSim = stringSimilarity(sourceNorm.artist, candidateNorm.artist);
  const albumSim =
    sourceNorm.album && candidateNorm.album
      ? stringSimilarity(sourceNorm.album, candidateNorm.album)
      : 0;

  if (titleSim > 0.92 && artistSim > 0.92) {
    const confidence = clampConfidence(88 * titleSim + 8);
    return {
      track: candidate,
      confidence,
      reason: 'Normalized title + artist',
      needsReview: confidence < LOW_CONFIDENCE_THRESHOLD,
    };
  }

  if (albumSim > 0.9 && artistSim > 0.92) {
    const confidence = clampConfidence(70 + albumSim * 15);
    return {
      track: candidate,
      confidence,
      reason: 'Album + artist',
      needsReview: true,
    };
  }

  const fuzzy = titleSim * 0.6 + artistSim * 0.4;
  const confidence = clampConfidence(fuzzy * 100);
  return {
    track: candidate,
    confidence,
    reason: 'Fuzzy title + artist',
    needsReview: true,
  };
}

/**
 * Rank destination-provider candidates for a source track.
 * Never auto-selects a low-confidence match — callers must show alternatives.
 */
export function matchTrack(source: TrackResult, candidates: TrackResult[]): MatchDecision {
  const ranked = candidates
    .map((candidate) => scoreMatch(source, candidate))
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0] ?? null;
  const alternatives = ranked.slice(1, 5);

  if (!best) {
    return { source, best: null, alternatives: [] };
  }

  if (best.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      source,
      best: { ...best, needsReview: true },
      alternatives,
    };
  }

  return { source, best, alternatives };
}

export class TrackMatcher {
  match(source: TrackResult, candidates: TrackResult[]): MatchDecision {
    return matchTrack(source, candidates);
  }

  score(source: TrackResult, candidate: TrackResult): MatchScore {
    return scoreMatch(source, candidate);
  }
}

export const trackMatcher = new TrackMatcher();
