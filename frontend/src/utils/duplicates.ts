import type { TrackResult } from '@/types';

export function trackKey(track: Pick<TrackResult, 'provider' | 'providerTrackId'>): string {
  return `${track.provider}:${track.providerTrackId}`;
}

export function isDuplicateTrack(existing: TrackResult[], candidate: TrackResult): boolean {
  const candidateIsrc = candidate.isrc?.replace(/[\s-]/g, '').toUpperCase();
  const title = candidate.title.trim().toLowerCase();
  const artist = candidate.artist.trim().toLowerCase();
  return existing.some((track) => {
    if (track.provider === candidate.provider && track.providerTrackId === candidate.providerTrackId) {
      return true;
    }
    const isrc = track.isrc?.replace(/[\s-]/g, '').toUpperCase();
    if (candidateIsrc && isrc && candidateIsrc === isrc) {
      return true;
    }
    return track.title.trim().toLowerCase() === title && track.artist.trim().toLowerCase() === artist;
  });
}
