export type ProviderId = 'spotify' | 'youtube' | 'amazon_music';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  enabled: boolean;
  connected: boolean;
  providerUserId?: string;
  expiresAt?: string | null;
  unavailableReason?: string | null;
}

export interface TrackResult {
  provider: ProviderId;
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  releaseDate?: string;
  isrc?: string;
  thumbnailUrl?: string;
  explicit?: boolean;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description?: string | null;
  coverImageUrl?: string | null;
  sourceProvider?: string | null;
  sourcePlaylistId?: string | null;
  language?: string | null;
  genre?: string | null;
  mood?: string | null;
  trackCount: number;
  totalDurationMs: number;
  tracks?: PlaylistTrackView[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistTrackView {
  id: string;
  position: number;
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
  thumbnailUrl?: string | null;
}

export interface SearchFilters {
  language?: string;
  genre?: string;
  mood?: string;
  yearFrom?: string;
  yearTo?: string;
  duration?: 'any' | 'short' | 'medium' | 'long';
}

export interface GeneratePlaylistPayload {
  prompt?: string;
  language?: string;
  mood?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  durationMinutes?: number;
  allowDuplicates?: boolean;
  targetProvider?: ProviderId;
}
