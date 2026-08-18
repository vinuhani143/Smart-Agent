import { normalizeTrackIdentity } from '../utils/normalize';
import type { TrackResult } from '../types/provider';

function isrcKey(isrc: string): string {
  return `isrc:${isrc.replace(/[\s-]/g, '').toUpperCase()}`;
}

function providerKey(track: TrackResult): string {
  return `provider:${track.provider}:${track.providerTrackId}`;
}

function identityKey(track: TrackResult): string {
  const normalized = normalizeTrackIdentity(track.title, track.artist);
  return `norm:${normalized.artist}|${normalized.title}`;
}

export function trackDuplicateKeys(track: TrackResult): string[] {
  const keys = [providerKey(track), identityKey(track)];
  if (track.isrc) {
    keys.push(isrcKey(track.isrc));
  }
  return keys;
}

export class DuplicateDetector {
  private readonly seen = new Set<string>();

  has(track: TrackResult): boolean {
    return trackDuplicateKeys(track).some((key) => this.seen.has(key));
  }

  add(track: TrackResult): void {
    for (const key of trackDuplicateKeys(track)) {
      this.seen.add(key);
    }
  }

  /**
   * Returns unique tracks in original order. Same ISRC, provider id, or
   * normalized title+artist is treated as a duplicate.
   */
  unique(tracks: TrackResult[], allowDuplicates = false): TrackResult[] {
    if (allowDuplicates) {
      return [...tracks];
    }
    const result: TrackResult[] = [];
    for (const track of tracks) {
      if (this.has(track)) {
        continue;
      }
      this.add(track);
      result.push(track);
    }
    return result;
  }
}

export function detectDuplicates(tracks: TrackResult[]): TrackResult[] {
  return new DuplicateDetector().unique(tracks, false);
}
