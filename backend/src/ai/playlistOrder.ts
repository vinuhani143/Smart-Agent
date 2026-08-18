import type { PlaylistIntent, ScoredTrack } from './types';

export type OrderingStrategy = 'score' | 'workout_requested' | 'romantic_requested' | 'night_drive_requested';

export interface OrderedPlaylist {
  tracks: ScoredTrack[];
  strategy: OrderingStrategy;
  note?: string;
}

function byScore(tracks: ScoredTrack[]): ScoredTrack[] {
  return [...tracks].sort((a, b) => b.trackScore - a.trackScore);
}

/**
 * Ordering is deterministic. Workout/romantic/night-drive prompts do not
 * invent BPM or energy when providers do not supply it — incoming ranked
 * order is kept. Callers should already sort by score or LLM rank.
 */
export function orderTracks(tracks: ScoredTrack[], intent: PlaylistIntent): OrderedPlaylist {
  const hasEnergyMetadata = tracks.some((item) => item.metadataFlags.energy === 'known');
  const ranked = hasEnergyMetadata ? byScore(tracks) : [...tracks];
  const mood = `${intent.mood ?? ''} ${intent.theme ?? ''} ${intent.energyLevel ?? ''}`.toLocaleLowerCase();

  if (/\bworkout\b|\bgym\b/.test(mood) || intent.theme === 'workout') {
    return {
      tracks: ranked,
      strategy: 'workout_requested',
      note: 'Ordered by match score. Provider catalogs did not include energy/BPM metadata, so a warmup-to-peak curve was not applied.',
    };
  }
  if (/\bromantic\b/.test(mood) || intent.theme === 'romantic') {
    return {
      tracks: ranked,
      strategy: 'romantic_requested',
      note: 'Ordered by match score. Mood/energy metadata was not available from the provider.',
    };
  }
  if (intent.theme === 'night_drive' || /\bnight drive\b|\brelax/.test(mood)) {
    return {
      tracks: ranked,
      strategy: 'night_drive_requested',
      note: 'Ordered by match score. Tempo metadata was not available from the provider.',
    };
  }
  return { tracks: ranked, strategy: 'score' };
}
