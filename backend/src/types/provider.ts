export type ProviderId = 'spotify' | 'youtube' | 'amazon_music';

export interface ProviderUser {
  id: string;
  displayName: string;
  email?: string;
  imageUrl?: string;
}

export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
}

export interface SearchTracksParams {
  query: string;
  limit?: number;
  offset?: number;
  language?: string;
  genre?: string;
  mood?: string;
  yearFrom?: number;
  yearTo?: number;
  durationMinMs?: number;
  durationMaxMs?: number;
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

export interface PlaylistResult {
  provider: ProviderId;
  providerPlaylistId: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  trackCount?: number;
  ownerName?: string;
}

export interface CreatePlaylistInput {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface ReorderPlaylistInput {
  rangeStart: number;
  insertBefore: number;
  rangeLength?: number;
}

export interface AuthorizationRequest {
  authorizationUrl: string;
  state: string;
}

/**
 * Provider-agnostic adapter. Each music service implements this contract.
 * Implementations must call official APIs only and must not invent results.
 */
export interface MusicProvider {
  readonly id: ProviderId;
  readonly displayName: string;

  /** False when credentials/API access are not configured. */
  isEnabled(): boolean;

  getAuthorizationUrl(state: string, codeChallenge?: string): AuthorizationRequest;

  authenticate(code: string, codeVerifier?: string): Promise<ProviderTokens & { user: ProviderUser }>;

  logout(tokens: ProviderTokens): Promise<void>;

  refreshAccessToken(tokens: ProviderTokens): Promise<ProviderTokens>;

  getCurrentUser(tokens: ProviderTokens): Promise<ProviderUser>;

  searchTracks(tokens: ProviderTokens | undefined, params: SearchTracksParams): Promise<TrackResult[]>;

  getTrack(tokens: ProviderTokens, providerTrackId: string): Promise<TrackResult>;

  getPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
  ): Promise<PlaylistResult & { tracks: TrackResult[] }>;

  getUserPlaylists(tokens: ProviderTokens): Promise<PlaylistResult[]>;

  createPlaylist(tokens: ProviderTokens, input: CreatePlaylistInput): Promise<PlaylistResult>;

  addTracksToPlaylist(tokens: ProviderTokens, playlistId: string, trackIds: string[]): Promise<void>;

  removeTracksFromPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    trackIds: string[],
  ): Promise<void>;

  reorderPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    input: ReorderPlaylistInput,
  ): Promise<void>;
}
