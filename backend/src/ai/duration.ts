import type { ScoredTrack } from './types';

export interface DurationSelection {
  tracks: ScoredTrack[];
  totalDurationMs: number;
  targetDurationMs: number;
  unknownDurationCount: number;
}

/**
 * Fill until the playlist is within about two minutes of the target.
 * Tracks without duration are included only while still under the target
 * and are not treated as a made-up length.
 */
export function selectByDuration(
  ranked: ScoredTrack[],
  durationMinutes: number | undefined,
  maxTracks: number | undefined,
): DurationSelection {
  if (durationMinutes === undefined) {
    const cap = maxTracks ?? 25;
    const tracks = ranked.slice(0, cap);
    const totalDurationMs = tracks.reduce((sum, item) => sum + (item.track.durationMs ?? 0), 0);
    const unknownDurationCount = tracks.filter((item) => !item.track.durationMs).length;
    return { tracks, totalDurationMs, targetDurationMs: 0, unknownDurationCount };
  }

  const targetDurationMs = durationMinutes * 60 * 1000;
  const minMs = targetDurationMs - 2 * 60 * 1000;
  const maxMs = targetDurationMs + 2 * 60 * 1000;
  const cap = maxTracks ?? 80;
  const tracks: ScoredTrack[] = [];
  let totalDurationMs = 0;
  let unknownDurationCount = 0;

  for (const item of ranked) {
    if (tracks.length >= cap) {
      break;
    }
    const duration = item.track.durationMs;
    if (duration === undefined || duration <= 0) {
      if (totalDurationMs < targetDurationMs) {
        tracks.push(item);
        unknownDurationCount += 1;
      }
      continue;
    }
    if (totalDurationMs >= targetDurationMs && totalDurationMs >= minMs) {
      break;
    }
    if (tracks.length > 0 && totalDurationMs >= minMs && totalDurationMs + duration > maxMs) {
      break;
    }
    tracks.push(item);
    totalDurationMs += duration;
  }

  return { tracks, totalDurationMs, targetDurationMs, unknownDurationCount };
}

export function formatDurationSummary(selection: DurationSelection): {
  targetMinutes: number;
  actualMinutes: number;
  trackCount: number;
} {
  return {
    targetMinutes: Math.round(selection.targetDurationMs / 60000),
    actualMinutes: Math.round(selection.totalDurationMs / 60000),
    trackCount: selection.tracks.length,
  };
}
