export type EnergyLevel = 'low' | 'medium' | 'high';
export type TempoHint = 'slow' | 'medium' | 'fast';
export type SearchProviderChoice = 'spotify' | 'youtube' | 'both';
export type DestinationProviderChoice = 'spotify' | 'youtube';

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
  energyLevel?: EnergyLevel;
  tempo?: TempoHint;
  sourceProvider?: SearchProviderChoice;
  destinationProvider?: DestinationProviderChoice;
}

export interface ScoredTrack {
  track: import('../types/provider').TrackResult;
  trackScore: number;
  breakdown: {
    languageMatch: number;
    genreMatch: number;
    moodMatch: number;
    yearMatch: number;
    artistMatch: number;
    metadataConfidence: number;
    providerAvailability: number;
  };
  metadataFlags: {
    language: 'known' | 'unknown';
    genre: 'known' | 'unknown';
    mood: 'known' | 'unknown';
    year: 'known' | 'unknown';
    explicit: 'known' | 'unknown';
    energy: 'known' | 'unknown';
    tempo: 'known' | 'unknown';
  };
}

export interface AIProvider {
  parsePlaylistRequest(prompt: string, hints?: Partial<PlaylistIntent>): Promise<PlaylistIntent>;
  rankTracks(tracks: ScoredTrack[], intent: PlaylistIntent): Promise<ScoredTrack[]>;
  generatePlaylistDescription(
    intent: PlaylistIntent,
    tracks: ScoredTrack[],
  ): Promise<{ title: string; description: string }>;
}
