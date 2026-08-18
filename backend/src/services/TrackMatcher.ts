import { stringSimilarity } from '../utils/fuzzy';
import { normalizeTrackIdentity } from '../utils/normalize';
import type { TrackResult } from '../types/provider';
import { parseYouTubeTitle } from '../providers/youtube/parseYouTubeTitle';

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

interface Identity {
  title: string;
  artist: string;
  album: string;
  strippedRemixOrLive: boolean;
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
  const sourceYt = source.youtubeVideoId ?? (source.provider === 'youtube' ? source.providerTrackId : undefined);
  const candidateYt =
    candidate.youtubeVideoId ?? (candidate.provider === 'youtube' ? candidate.providerTrackId : undefined);
  return Boolean(sourceYt && candidateYt && sourceYt === candidateYt);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function identitiesFor(track: TrackResult): Identity[] {
  const primary = normalizeTrackIdentity(
    track.parsedTitle ?? track.title,
    track.parsedArtist ?? track.artist,
    track.album,
  );
  const list: Identity[] = [primary];
  if (track.originalTitle && track.originalTitle !== track.title) {
    const parsed = parseYouTubeTitle(track.originalTitle, track.artist);
    list.push(normalizeTrackIdentity(parsed.parsedTitle ?? parsed.title, parsed.parsedArtist ?? parsed.artist));
  }
  if (track.provider === 'youtube') {
    const parsed = parseYouTubeTitle(track.originalTitle ?? track.title, track.artist);
    list.push(normalizeTrackIdentity(parsed.parsedTitle ?? parsed.title, parsed.parsedArtist ?? parsed.artist));
  }
  return list;
}

function scoreIdentities(source: Identity, candidate: Identity): { confidence: number; reason: string } | null {
  if (source.title === candidate.title && source.artist === candidate.artist && source.title.length > 0) {
    const penalty = source.strippedRemixOrLive || candidate.strippedRemixOrLive ? 8 : 0;
    return { confidence: clampConfidence(96 - penalty), reason: 'Exact title + artist' };
  }

  const titleSim = stringSimilarity(source.title, candidate.title);
  const artistSim = stringSimilarity(source.artist, candidate.artist);
  const albumSim =
    source.album && candidate.album ? stringSimilarity(source.album, candidate.album) : 0;

  if (titleSim > 0.92 && artistSim > 0.92) {
    return {
      confidence: clampConfidence(88 * titleSim + 8),
      reason: 'Normalized title + artist',
    };
  }

  if (albumSim > 0.9 && artistSim > 0.92) {
    return { confidence: clampConfidence(70 + albumSim * 15), reason: 'Album + artist' };
  }

  const fuzzy = titleSim * 0.6 + artistSim * 0.4;
  if (fuzzy >= 0.5) {
    return { confidence: clampConfidence(fuzzy * 100), reason: 'Fuzzy title + artist' };
  }
  return null;
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

  let best: { confidence: number; reason: string } = {
    confidence: 0,
    reason: 'Fuzzy title + artist',
  };
  for (const sourceId of identitiesFor(source)) {
    for (const candidateId of identitiesFor(candidate)) {
      const scored = scoreIdentities(sourceId, candidateId);
      if (scored && scored.confidence > best.confidence) {
        best = scored;
      }
    }
  }

  return {
    track: candidate,
    confidence: best.confidence,
    reason: best.reason,
    needsReview: best.confidence < LOW_CONFIDENCE_THRESHOLD,
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
