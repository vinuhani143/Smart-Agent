import { DuplicateDetector, trackDuplicateKeys } from './DuplicateDetector';
import type { MatchDecision, MatchMethod, MatchStatus } from './TrackMatcher';
import { HIGH_CONFIDENCE_THRESHOLD, matchTrack } from './TrackMatcher';
import type { ProviderId, TrackResult } from '../types/provider';

export type ConversionTrackDecisionStatus =
  | 'MATCHED'
  | 'NEEDS_REVIEW'
  | 'NOT_FOUND'
  | 'ACCEPTED'
  | 'SKIPPED'
  | 'MANUAL'
  | 'DUPLICATE';

export interface ConversionMatchRow {
  sourceTrackId: string;
  destinationTrackId?: string;
  sourceTrack: TrackResult;
  destinationTrack?: TrackResult;
  alternatives: TrackResult[];
  alternativeScores: Array<{ track: TrackResult; confidence: number; matchMethod: MatchMethod }>;
  confidence: number;
  matchMethod?: MatchMethod;
  status: ConversionTrackDecisionStatus;
  position: number;
}

export interface ConversionSummaryCounts {
  totalTracks: number;
  matchedTracks: number;
  reviewTracks: number;
  notFoundTracks: number;
  duplicateTracks: number;
  destinationTrackCount: number;
}

export interface UserMatchDecision {
  sourceTrackId: string;
  action: 'accept' | 'skip' | 'select_alternative' | 'manual';
  destinationTrack?: TrackResult;
}

export function searchQueriesForConversion(source: TrackResult, destination: ProviderId): string[] {
  const title = (source.parsedTitle ?? source.title).trim();
  const artist = (source.parsedArtist ?? source.artist).trim();
  const album = source.album?.trim();
  const queries: string[] = [];

  if (destination === 'youtube') {
    queries.push(`${artist} ${title}`.trim());
    queries.push(`${title} ${artist}`.trim());
    if (album) {
      queries.push(`${artist} ${title} ${album}`.trim());
    }
  } else {
    queries.push(`${title} ${artist}`.trim());
    queries.push(`${artist} ${title}`.trim());
    if (album) {
      queries.push(`${title} ${artist} ${album}`.trim());
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const query of queries) {
    const key = query.toLocaleLowerCase();
    if (!query || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(query);
  }
  return unique;
}

export function statusFromMatch(status: MatchStatus): ConversionTrackDecisionStatus {
  if (status === 'matched') {
    return 'MATCHED';
  }
  if (status === 'needs_review') {
    return 'NEEDS_REVIEW';
  }
  return 'NOT_FOUND';
}

export function rowFromDecision(decision: MatchDecision, position: number): ConversionMatchRow {
  return {
    sourceTrackId: decision.source.providerTrackId,
    destinationTrackId: decision.best?.track.providerTrackId,
    sourceTrack: decision.source,
    destinationTrack: decision.best?.track,
    alternatives: decision.alternatives.map((item) => item.track),
    alternativeScores: decision.alternatives.map((item) => ({
      track: item.track,
      confidence: item.confidence,
      matchMethod: item.matchMethod,
    })),
    confidence: decision.best?.confidence ?? 0,
    matchMethod: decision.matchMethod ?? decision.best?.matchMethod,
    status: statusFromMatch(decision.status),
    position,
  };
}

/**
 * When two source tracks map to the same destination, keep the highest-confidence
 * row and mark the rest as duplicates.
 */
export function applyDestinationDuplicates(rows: ConversionMatchRow[]): ConversionMatchRow[] {
  const winnerByKey = new Map<string, { index: number; confidence: number }>();

  rows.forEach((row, index) => {
    if (!row.destinationTrack || row.status === 'NOT_FOUND') {
      return;
    }
    for (const key of trackDuplicateKeys(row.destinationTrack)) {
      const existing = winnerByKey.get(key);
      if (!existing || row.confidence > existing.confidence) {
        winnerByKey.set(key, { index, confidence: row.confidence });
      }
    }
  });

  const winnerIndexes = new Set(
    [...winnerByKey.values()].map((entry) => entry.index),
  );

  return rows.map((row, index) => {
    if (!row.destinationTrack || row.status === 'NOT_FOUND' || row.status === 'SKIPPED') {
      return row;
    }
    const keys = trackDuplicateKeys(row.destinationTrack);
    const isWinner = keys.some((key) => winnerByKey.get(key)?.index === index);
    if (isWinner || winnerIndexes.has(index)) {
      const stillWinner = keys.every((key) => {
        const mapped = winnerByKey.get(key);
        return !mapped || mapped.index === index;
      });
      if (stillWinner) {
        return row;
      }
    }
    const conflicts = keys.some((key) => {
      const mapped = winnerByKey.get(key);
      return mapped !== undefined && mapped.index !== index;
    });
    if (!conflicts) {
      return row;
    }
    return { ...row, status: 'DUPLICATE' as const };
  });
}

export function summarizeConversion(rows: ConversionMatchRow[]): ConversionSummaryCounts {
  const matchedTracks = rows.filter((row) => row.status === 'MATCHED' || row.status === 'ACCEPTED').length;
  const reviewTracks = rows.filter((row) => row.status === 'NEEDS_REVIEW').length;
  const notFoundTracks = rows.filter((row) => row.status === 'NOT_FOUND').length;
  const duplicateTracks = rows.filter((row) => row.status === 'DUPLICATE').length;
  return {
    totalTracks: rows.length,
    matchedTracks,
    reviewTracks,
    notFoundTracks,
    duplicateTracks,
    destinationTrackCount: rowsEligibleForDestination(rows).length,
  };
}

export function rowsEligibleForDestination(rows: ConversionMatchRow[]): ConversionMatchRow[] {
  const eligible = rows.filter(
    (row) =>
      (row.status === 'MATCHED' || row.status === 'ACCEPTED' || row.status === 'MANUAL') &&
      Boolean(row.destinationTrackId && row.destinationTrack),
  );
  const unique = new DuplicateDetector().unique(
    eligible.map((row) => row.destinationTrack!) ,
  );
  const allowed = new Set(unique.map((track) => `${track.provider}:${track.providerTrackId}`));
  const kept: ConversionMatchRow[] = [];
  for (const row of eligible) {
    const track = row.destinationTrack;
    if (!track) {
      continue;
    }
    const key = `${track.provider}:${track.providerTrackId}`;
    if (!allowed.has(key)) {
      continue;
    }
    allowed.delete(key);
    kept.push(row);
  }
  return kept;
}

export function applyUserDecisions(
  rows: ConversionMatchRow[],
  decisions: UserMatchDecision[],
  acceptAllHighConfidence: boolean,
): ConversionMatchRow[] {
  const bySource = new Map(decisions.map((decision) => [decision.sourceTrackId, decision]));
  return rows.map((row) => {
    const decision = bySource.get(row.sourceTrackId);
    if (decision) {
      if (decision.action === 'skip') {
        return { ...row, status: 'SKIPPED', destinationTrack: row.destinationTrack, destinationTrackId: row.destinationTrackId };
      }
      if (decision.action === 'manual' && decision.destinationTrack) {
        return {
          ...row,
          status: 'MANUAL',
          destinationTrack: decision.destinationTrack,
          destinationTrackId: decision.destinationTrack.providerTrackId,
          confidence: 100,
          matchMethod: 'manual',
        };
      }
      if (decision.action === 'select_alternative' && decision.destinationTrack) {
        return {
          ...row,
          status: 'ACCEPTED',
          destinationTrack: decision.destinationTrack,
          destinationTrackId: decision.destinationTrack.providerTrackId,
          matchMethod: row.matchMethod,
        };
      }
      if (decision.action === 'accept' && (decision.destinationTrack || row.destinationTrack)) {
        const dest = decision.destinationTrack ?? row.destinationTrack;
        return {
          ...row,
          status: 'ACCEPTED',
          destinationTrack: dest,
          destinationTrackId: dest?.providerTrackId,
        };
      }
    }
    if (acceptAllHighConfidence && row.status === 'MATCHED' && row.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      return { ...row, status: 'ACCEPTED' };
    }
    return row;
  });
}

export function mergeCandidates(groups: TrackResult[][]): TrackResult[] {
  const detector = new DuplicateDetector();
  return detector.unique(groups.flat());
}

export function matchSourceTrack(source: TrackResult, candidates: TrackResult[]): ConversionMatchRow {
  return rowFromDecision(matchTrack(source, candidates), 0);
}
