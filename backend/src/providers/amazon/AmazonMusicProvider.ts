import { getEnv } from '../../config/env';
import { ConfigurationError, ProviderUnavailableError } from '../../types/errors';
import type {
  AuthorizationRequest,
  CreatePlaylistInput,
  MusicProvider,
  PlaylistResult,
  ProviderId,
  ProviderTokens,
  ProviderUser,
  ReorderPlaylistInput,
  SearchTracksParams,
  TrackResult,
} from '../../types/provider';

/**
 * Placeholder adapter for Amazon Music.
 *
 * Amazon Music does not currently expose a generally available public playlist API
 * comparable to Spotify Web API / YouTube Data API. This class preserves the
 * MusicProvider contract so Amazon can be enabled later without rewriting callers.
 *
 * Do not invent API responses. All methods fail until official credentials exist.
 */
export class AmazonMusicProvider implements MusicProvider {
  readonly id: ProviderId = 'amazon_music';
  readonly displayName = 'Amazon Music';

  isEnabled(): boolean {
    const env = getEnv();
    return Boolean(env.AMAZON_MUSIC_CLIENT_ID && env.AMAZON_MUSIC_CLIENT_SECRET);
  }

  getAuthorizationUrl(_state: string, _codeChallenge?: string): AuthorizationRequest {
    throw this.unavailable();
  }

  authenticate(_code: string, _codeVerifier?: string): Promise<ProviderTokens & { user: ProviderUser }> {
    return Promise.reject(this.unavailable());
  }

  logout(_tokens: ProviderTokens): Promise<void> {
    return Promise.reject(this.unavailable());
  }

  refreshAccessToken(_tokens: ProviderTokens): Promise<ProviderTokens> {
    return Promise.reject(this.unavailable());
  }

  getCurrentUser(_tokens: ProviderTokens): Promise<ProviderUser> {
    return Promise.reject(this.unavailable());
  }

  searchTracks(_tokens: ProviderTokens | undefined, _params: SearchTracksParams): Promise<TrackResult[]> {
    return Promise.reject(this.unavailable());
  }

  getTrack(_tokens: ProviderTokens, _providerTrackId: string): Promise<TrackResult> {
    return Promise.reject(this.unavailable());
  }

  getPlaylist(
    _tokens: ProviderTokens,
    _playlistId: string,
  ): Promise<PlaylistResult & { tracks: TrackResult[] }> {
    return Promise.reject(this.unavailable());
  }

  getUserPlaylists(_tokens: ProviderTokens): Promise<PlaylistResult[]> {
    return Promise.reject(this.unavailable());
  }

  createPlaylist(_tokens: ProviderTokens, _input: CreatePlaylistInput): Promise<PlaylistResult> {
    return Promise.reject(this.unavailable());
  }

  addTracksToPlaylist(_tokens: ProviderTokens, _playlistId: string, _trackIds: string[]): Promise<void> {
    return Promise.reject(this.unavailable());
  }

  removeTracksFromPlaylist(
    _tokens: ProviderTokens,
    _playlistId: string,
    _trackIds: string[],
  ): Promise<void> {
    return Promise.reject(this.unavailable());
  }

  reorderPlaylist(
    _tokens: ProviderTokens,
    _playlistId: string,
    _input: ReorderPlaylistInput,
  ): Promise<void> {
    return Promise.reject(this.unavailable());
  }

  private unavailable(): ProviderUnavailableError | ConfigurationError {
    if (this.isEnabled()) {
      return new ConfigurationError(
        'Amazon Music credentials are present, but the official playlist API integration is not implemented yet.',
      );
    }
    return new ProviderUnavailableError(
      this.id,
      'Amazon Music is not available. Official API access is not configured. This adapter is a placeholder.',
    );
  }
}
