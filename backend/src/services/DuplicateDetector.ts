import { normalizeTrackIdentity } from '../utils/normalize';
import type { TrackResult } from '../types/provider';

function isrcKey(isrc: string): string {
  return `isrc:${isrc.replace(/[\s-]/g, '').toUpperCase()}`;
}

function identityKey(track: TrackResult): string {
  const title = track.parsedTitle ?? track.title;
  const artist = track.parsedArtist ?? track.artist;
  const normalized = normalizeTrackIdentity(title, artist);
  return `norm:${normalized.artist}|${normalized.title}`;
}

export function youtubeVideoIdOf(track: TrackResult): string | undefined {
  return track.youtubeVideoId ?? (track.provider === 'youtube' ? track.providerTrackId : undefined);
}

export function spotifyIdOf(track: TrackResult): string | undefined {
  return track.spotifyId ?? (track.provider === 'spotify' ? track.providerTrackId : undefined);
}

export function amazonMusicIdOf(track: TrackResult): string | undefined {
  return track.amazonMusicId ?? (track.provider === 'amazon_music' ? track.providerTrackId : undefined);
}

export function trackDuplicateKeys(track: TrackResult): string[] {
  const keys = [identityKey(track)];
  const youtubeId = youtubeVideoIdOf(track);
  const spotifyId = spotifyIdOf(track);
  const amazonId = amazonMusicIdOf(track);
  if (youtubeId) {
    keys.push(`youtube:${youtubeId}`);
  }
  if (spotifyId) {
    keys.push(`spotify:${spotifyId}`);
  }
  if (amazonId) {
    keys.push(`amazon:${amazonId}`);
  }
  keys.push(`provider:${track.provider}:${track.providerTrackId}`);
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
   * Returns unique tracks in original order. Same ISRC, YouTube video id,
   * Spotify id, or normalized title+artist is treated as a duplicate.
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
