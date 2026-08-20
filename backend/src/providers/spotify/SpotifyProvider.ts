import { getEnv } from '../../config/env';
import { ConfigurationError, TokenInvalidError } from '../../types/errors';
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
import { bearerHeaders, providerJson, requireAccessToken } from '../http';
import {
  requestSpotifyToken,
  spotifyAuthorizationCodeBody,
  spotifyBasicAuthHeader,
  spotifyRefreshTokenBody,
  tokensFromSpotifyResponse,
} from './spotifyAuth';

const SPOTIFY_AUTHORIZE = 'https://accounts.spotify.com/authorize';
const SPOTIFY_API = 'https://api.spotify.com/v1';

const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

interface SpotifyUserResponse {
  id: string;
  display_name?: string;
  email?: string;
  images?: Array<{ url: string }>;
}

interface SpotifyImage {
  url: string;
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyAlbum {
  name: string;
  images?: SpotifyImage[];
  release_date?: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  external_ids?: { isrc?: string };
}

interface SpotifySearchResponse {
  tracks?: { items: Array<SpotifyTrack | null> };
}

interface SpotifyPlaylistResponse {
  id: string;
  name: string;
  description?: string | null;
  images?: SpotifyImage[];
  owner?: { display_name?: string };
  tracks: {
    total: number;
    items?: Array<{ track: SpotifyTrack | null }>;
    next?: string | null;
  };
}

function mapTrack(track: SpotifyTrack): TrackResult {
  const artist = track.artists.map((item) => item.name).join(', ');
  return {
    provider: 'spotify',
    providerTrackId: track.id,
    spotifyId: track.id,
    title: track.name,
    artist,
    album: track.album.name,
    durationMs: track.duration_ms,
    releaseDate: track.album.release_date,
    isrc: track.external_ids?.isrc,
    thumbnailUrl: track.album.images?.[0]?.url,
    explicit: track.explicit,
  };
}

function buildSearchQuery(params: SearchTracksParams): string {
  const parts = [params.query.trim()];
  if (params.language) {
    parts.push(params.language);
  }
  if (params.genre) {
    parts.push(`genre:${params.genre}`);
  }
  if (params.mood) {
    parts.push(params.mood);
  }
  if (params.yearFrom && params.yearTo) {
    parts.push(`year:${params.yearFrom}-${params.yearTo}`);
  } else if (params.yearFrom) {
    parts.push(`year:${params.yearFrom}`);
  }
  return parts.filter((part) => part.length > 0).join(' ');
}

function applyLocalFilters(tracks: TrackResult[], params: SearchTracksParams): TrackResult[] {
  return tracks.filter((track) => {
    if (params.durationMinMs !== undefined && (track.durationMs ?? 0) < params.durationMinMs) {
      return false;
    }
    if (params.durationMaxMs !== undefined && (track.durationMs ?? Number.POSITIVE_INFINITY) > params.durationMaxMs) {
      return false;
    }
    return true;
  });
}

export class SpotifyProvider implements MusicProvider {
  readonly id: ProviderId = 'spotify';
  readonly displayName = 'Spotify';

  isEnabled(): boolean {
    const env = getEnv();
    return Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.SPOTIFY_REDIRECT_URI);
  }

  getAuthorizationUrl(state: string, codeChallenge?: string): AuthorizationRequest {
    const env = this.requireConfig();
    const url = new URL(SPOTIFY_AUTHORIZE);
    url.searchParams.set('client_id', env.SPOTIFY_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', env.SPOTIFY_REDIRECT_URI);
    url.searchParams.set('scope', SPOTIFY_SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('show_dialog', 'true');
    if (codeChallenge) {
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('code_challenge', codeChallenge);
    }
    return { authorizationUrl: url.toString(), state };
  }

  async authenticate(code: string, codeVerifier?: string): Promise<ProviderTokens & { user: ProviderUser }> {
    const tokens = await this.exchangeCode(code, codeVerifier);
    const user = await this.getCurrentUser(tokens);
    return { ...tokens, user };
  }

  async logout(_tokens: ProviderTokens): Promise<void> {
    // Spotify does not provide a token-revoke endpoint for this flow.
  }

  async refreshAccessToken(tokens: ProviderTokens): Promise<ProviderTokens> {
    if (!tokens.refreshToken) {
      throw new TokenInvalidError(
        'Your Spotify session expired. Please reconnect Spotify in Settings.',
      );
    }
    const response = await requestSpotifyToken(spotifyRefreshTokenBody(tokens.refreshToken), this.tokenHeaders());
    return tokensFromSpotifyResponse(response, tokens.refreshToken);
  }

  async getCurrentUser(tokens: ProviderTokens): Promise<ProviderUser> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const profile = await providerJson<SpotifyUserResponse>(`${SPOTIFY_API}/me`, {
      headers: bearerHeaders(accessToken),
    });
    return {
      id: profile.id,
      displayName: profile.display_name ?? profile.id,
      email: profile.email,
      imageUrl: profile.images?.[0]?.url,
    };
  }

  async searchTracks(
    tokens: ProviderTokens | undefined,
    params: SearchTracksParams,
  ): Promise<TrackResult[]> {
    const accessToken = requireAccessToken(tokens?.accessToken);
    const query = buildSearchQuery(params);
    const url = new URL(`${SPOTIFY_API}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'track');
    url.searchParams.set('limit', String(params.limit ?? 20));
    url.searchParams.set('offset', String(params.offset ?? 0));

    const data = await providerJson<SpotifySearchResponse>(url.toString(), {
      headers: bearerHeaders(accessToken),
    });
    const tracks = (data.tracks?.items ?? []).filter((item): item is SpotifyTrack => item !== null).map(mapTrack);
    return applyLocalFilters(tracks, params);
  }

  async getTrack(tokens: ProviderTokens, providerTrackId: string): Promise<TrackResult> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const track = await providerJson<SpotifyTrack>(`${SPOTIFY_API}/tracks/${providerTrackId}`, {
      headers: bearerHeaders(accessToken),
    });
    return mapTrack(track);
  }

  async getPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
  ): Promise<PlaylistResult & { tracks: TrackResult[] }> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlist = await providerJson<SpotifyPlaylistResponse>(
      `${SPOTIFY_API}/playlists/${playlistId}?market=from_token`,
      { headers: bearerHeaders(accessToken) },
    );
    const tracks: TrackResult[] = [];
    for (const item of playlist.tracks.items ?? []) {
      if (item.track) {
        tracks.push(mapTrack(item.track));
      }
    }
    let nextUrl = playlist.tracks.next;
    while (nextUrl) {
      const page = await providerJson<SpotifyPlaylistResponse['tracks']>(nextUrl, {
        headers: bearerHeaders(accessToken),
      });
      for (const item of page.items ?? []) {
        if (item.track) {
          tracks.push(mapTrack(item.track));
        }
      }
      nextUrl = page.next ?? null;
    }
    return {
      provider: 'spotify',
      providerPlaylistId: playlist.id,
      name: playlist.name,
      description: playlist.description ?? undefined,
      coverImageUrl: playlist.images?.[0]?.url,
      trackCount: playlist.tracks.total,
      ownerName: playlist.owner?.display_name,
      tracks,
    };
  }

  async getUserPlaylists(tokens: ProviderTokens): Promise<PlaylistResult[]> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const data = await providerJson<{ items: SpotifyPlaylistResponse[] }>(
      `${SPOTIFY_API}/me/playlists?limit=50`,
      { headers: bearerHeaders(accessToken) },
    );
    return data.items.map((playlist) => ({
      provider: 'spotify' as const,
      providerPlaylistId: playlist.id,
      name: playlist.name,
      description: playlist.description ?? undefined,
      coverImageUrl: playlist.images?.[0]?.url,
      trackCount: playlist.tracks.total,
      ownerName: playlist.owner?.display_name,
    }));
  }

  async createPlaylist(tokens: ProviderTokens, input: CreatePlaylistInput): Promise<PlaylistResult> {
    const user = await this.getCurrentUser(tokens);
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlist = await providerJson<SpotifyPlaylistResponse>(
      `${SPOTIFY_API}/users/${encodeURIComponent(user.id)}/playlists`,
      {
        method: 'POST',
        headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: input.name,
          description: input.description ?? '',
          public: input.isPublic ?? false,
        }),
      },
    );
    return {
      provider: 'spotify',
      providerPlaylistId: playlist.id,
      name: playlist.name,
      description: playlist.description ?? undefined,
      coverImageUrl: playlist.images?.[0]?.url,
    };
  }

  async addTracksToPlaylist(tokens: ProviderTokens, playlistId: string, trackIds: string[]): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const uris = trackIds.map((id) => `spotify:track:${id}`);
    for (let i = 0; i < uris.length; i += 100) {
      const chunk = uris.slice(i, i + 100);
      await providerJson(`${SPOTIFY_API}/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ uris: chunk }),
      });
    }
  }

  async removeTracksFromPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    trackIds: string[],
  ): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const tracks = trackIds.map((id) => ({ uri: `spotify:track:${id}` }));
    await providerJson(`${SPOTIFY_API}/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ tracks }),
    });
  }

  async reorderPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    input: ReorderPlaylistInput,
  ): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    await providerJson(`${SPOTIFY_API}/playlists/${playlistId}/tracks`, {
      method: 'PUT',
      headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        range_start: input.rangeStart,
        insert_before: input.insertBefore,
        range_length: input.rangeLength ?? 1,
      }),
    });
  }

  async updatePlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    input: { name?: string; description?: string },
  ): Promise<PlaylistResult> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlist = await providerJson<SpotifyPlaylistResponse>(`${SPOTIFY_API}/playlists/${playlistId}`, {
      method: 'PUT',
      headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        name: input.name,
        description: input.description,
      }),
    });
    return {
      provider: 'spotify',
      providerPlaylistId: playlist.id,
      name: playlist.name,
      description: playlist.description ?? undefined,
      coverImageUrl: playlist.images?.[0]?.url,
    };
  }

  async deletePlaylist(tokens: ProviderTokens, playlistId: string): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    await providerJson(`${SPOTIFY_API}/playlists/${playlistId}/followers`, {
      method: 'DELETE',
      headers: bearerHeaders(accessToken),
    });
  }

  private async exchangeCode(code: string, codeVerifier?: string): Promise<ProviderTokens> {
    const env = this.requireConfig();
    const response = await requestSpotifyToken(
      spotifyAuthorizationCodeBody({
        code,
        redirectUri: env.SPOTIFY_REDIRECT_URI,
        clientId: env.SPOTIFY_CLIENT_ID,
        codeVerifier,
      }),
      this.tokenHeaders(),
    );
    return tokensFromSpotifyResponse(response);
  }

  private tokenHeaders(): Record<string, string> {
    const env = this.requireConfig();
    return {
      Authorization: spotifyBasicAuthHeader(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  private requireConfig() {
    const env = getEnv();
    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET || !env.SPOTIFY_REDIRECT_URI) {
      throw new ConfigurationError(
        'Spotify is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.',
      );
    }
    return env;
  }
}
