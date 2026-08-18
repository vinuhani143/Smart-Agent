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
  displayName?: string | null;
  imageUrl?: string | null;
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
  originalTitle?: string;
  metadataConfidence?: number;
  parsedTitle?: string;
  parsedArtist?: string;
  youtubeVideoId?: string;
  spotifyId?: string;
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
  provider?: 'all' | 'spotify' | 'youtube';
}

export interface GeneratePlaylistPayload {
  prompt: string;
  provider?: 'spotify' | 'youtube' | 'both';
  destinationProvider?: 'spotify' | 'youtube';
  language?: string;
  mood?: string;
  genre?: string;
  artist?: string;
  yearFrom?: number;
  yearTo?: number;
  durationMinutes?: number;
  maxTracks?: number;
  allowDuplicates?: boolean;
  explicitContent?: boolean;
}

export interface PlaylistIntent {
  language?: string;
  genre?: string;
  mood?: string;
  theme?: string;
  artist?: string;
  yearFrom?: number;
  yearTo?: number;
  durationMinutes?: number;
  maxTracks?: number;
  allowDuplicates?: boolean;
  explicitContent?: boolean;
  energyLevel?: 'low' | 'medium' | 'high';
  tempo?: 'slow' | 'medium' | 'fast';
  sourceProvider?: 'spotify' | 'youtube' | 'both';
  destinationProvider?: 'spotify' | 'youtube';
}

export interface GeneratedTrack extends TrackResult {
  trackScore: number;
  metadataFlags?: {
    language: 'known' | 'unknown';
    genre: 'known' | 'unknown';
    mood: 'known' | 'unknown';
    year: 'known' | 'unknown';
    explicit: 'known' | 'unknown';
    energy: 'known' | 'unknown';
    tempo: 'known' | 'unknown';
  };
}

export interface PlaylistGenerationView {
  generationId: string;
  intent: PlaylistIntent;
  playlist: {
    title: string;
    description: string;
    tracks: GeneratedTrack[];
  };
  summary: {
    targetDurationMinutes: number | null;
    actualDurationMinutes: number;
    trackCount: number;
    warning: string | null;
    orderingNote: string | null;
    searchQueries: string[];
    sourceProvider: 'spotify' | 'youtube' | 'both';
    destinationProvider: 'spotify' | 'youtube' | null;
  };
  status: string;
  confirmationRequired: true;
}

export type ConvertibleProvider = 'spotify' | 'youtube';

export type ConversionMatchStatus =
  | 'matched'
  | 'needs_review'
  | 'not_found'
  | 'accepted'
  | 'skipped'
  | 'manual'
  | 'duplicate';

export interface ConversionAlternative {
  track: TrackResult;
  confidence: number;
  matchMethod?: string;
}

export interface ConversionMatch {
  id: string;
  sourceTrackId: string;
  destinationTrackId?: string | null;
  sourceTrack: TrackResult;
  destinationTrack?: TrackResult | null;
  alternatives: ConversionAlternative[];
  confidence: number;
  matchMethod?: string | null;
  status: ConversionMatchStatus;
  addedToDestination?: boolean;
  errorMessage?: string | null;
}

export interface ConversionSummary {
  totalTracks: number;
  matchedTracks: number;
  reviewTracks: number;
  notFoundTracks: number;
  duplicateTracks: number;
  destinationTrackCount: number;
  addedTracks?: number;
}

export interface ConversionResult {
  conversionId: string;
  status: string;
  sourceProvider: ConvertibleProvider;
  sourcePlaylistId: string;
  sourcePlaylistName?: string | null;
  destinationProvider: ConvertibleProvider;
  destinationPlaylistId?: string | null;
  localPlaylistId?: string | null;
  summary: ConversionSummary;
  errorMessage?: string | null;
  createdMessage?: string;
  matches: ConversionMatch[];
}

export interface RemotePlaylist {
  provider: ConvertibleProvider;
  providerPlaylistId: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  trackCount?: number;
  ownerName?: string;
}
