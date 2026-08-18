import { getEnv } from '../../config/env';
import { ConfigurationError, OAuthFailedError, TokenInvalidError } from '../../types/errors';
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

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube',
].join(' ');

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  error?: string;
}

interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

interface YouTubeSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { high?: { url: string }; default?: { url: string } };
  };
}

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { high?: { url: string }; default?: { url: string } };
  };
  contentDetails?: { duration?: string };
}

interface YouTubePlaylistItem {
  id: string;
  snippet: {
    title: string;
    description?: string;
    channelTitle?: string;
    thumbnails?: { high?: { url: string }; default?: { url: string } };
  };
  contentDetails?: { itemCount?: number };
}

function parseIsoDurationMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(value);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

function mapVideo(item: YouTubeVideoItem): TrackResult {
  return {
    provider: 'youtube',
    providerTrackId: item.id,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    durationMs: parseIsoDurationMs(item.contentDetails?.duration),
    releaseDate: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url,
  };
}

function durationFilterParam(params: SearchTracksParams): string | undefined {
  if (params.durationMaxMs !== undefined && params.durationMaxMs <= 4 * 60 * 1000) {
    return 'short';
  }
  if (params.durationMinMs !== undefined && params.durationMinMs >= 20 * 60 * 1000) {
    return 'long';
  }
  if (params.durationMinMs !== undefined || params.durationMaxMs !== undefined) {
    return 'medium';
  }
  return undefined;
}

function applyLocalFilters(tracks: TrackResult[], params: SearchTracksParams): TrackResult[] {
  return tracks.filter((track) => {
    if (params.yearFrom && track.releaseDate) {
      const year = new Date(track.releaseDate).getUTCFullYear();
      if (year < params.yearFrom) {
        return false;
      }
    }
    if (params.yearTo && track.releaseDate) {
      const year = new Date(track.releaseDate).getUTCFullYear();
      if (year > params.yearTo) {
        return false;
      }
    }
    if (params.durationMinMs !== undefined && (track.durationMs ?? 0) < params.durationMinMs) {
      return false;
    }
    if (params.durationMaxMs !== undefined && (track.durationMs ?? Number.POSITIVE_INFINITY) > params.durationMaxMs) {
      return false;
    }
    return true;
  });
}

export class YouTubeProvider implements MusicProvider {
  readonly id: ProviderId = 'youtube';
  readonly displayName = 'YouTube';

  isEnabled(): boolean {
    const env = getEnv();
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
  }

  getAuthorizationUrl(state: string, codeChallenge?: string): AuthorizationRequest {
    const env = this.requireConfig();
    const url = new URL(GOOGLE_AUTHORIZE);
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
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

  async logout(tokens: ProviderTokens): Promise<void> {
    const body = new URLSearchParams({ token: tokens.accessToken });
    await providerJson(GOOGLE_REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }).catch(() => undefined);
  }

  async refreshAccessToken(tokens: ProviderTokens): Promise<ProviderTokens> {
    if (!tokens.refreshToken) {
      throw new TokenInvalidError('Google did not provide a refresh token. Please reconnect YouTube.');
    }
    const env = this.requireConfig();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
    });
    const response = await providerJson<GoogleTokenResponse>(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return this.toTokens(response, tokens.refreshToken);
  }

  async getCurrentUser(tokens: ProviderTokens): Promise<ProviderUser> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const profile = await providerJson<GoogleUserInfo>(GOOGLE_USERINFO, {
      headers: bearerHeaders(accessToken),
    });
    return {
      id: profile.sub,
      displayName: profile.name ?? profile.email ?? profile.sub,
      email: profile.email,
      imageUrl: profile.picture,
    };
  }

  async searchTracks(
    tokens: ProviderTokens | undefined,
    params: SearchTracksParams,
  ): Promise<TrackResult[]> {
    const env = getEnv();
    const queryParts = [params.query, params.language, params.genre, params.mood].filter(
      (part): part is string => Boolean(part && part.length > 0),
    );
    const url = new URL(`${YOUTUBE_API}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10');
    url.searchParams.set('maxResults', String(params.limit ?? 20));
    url.searchParams.set('q', queryParts.join(' '));
    const duration = durationFilterParam(params);
    if (duration) {
      url.searchParams.set('videoDuration', duration);
    }

    const accessToken = tokens?.accessToken;
    if (accessToken) {
      url.searchParams.set('access_token', accessToken);
    } else if (env.YOUTUBE_API_KEY) {
      url.searchParams.set('key', env.YOUTUBE_API_KEY);
    } else {
      throw new TokenInvalidError('Connect YouTube or configure YOUTUBE_API_KEY to search.');
    }

    const search = await providerJson<{ items?: YouTubeSearchItem[] }>(url.toString());
    const ids = (search.items ?? [])
      .map((item) => item.id.videoId)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      return [];
    }
    const videos = await this.getVideos(ids, accessToken ?? undefined, env.YOUTUBE_API_KEY || undefined);
    return applyLocalFilters(videos.map(mapVideo), params);
  }

  async getTrack(tokens: ProviderTokens, providerTrackId: string): Promise<TrackResult> {
    const env = getEnv();
    const videos = await this.getVideos(
      [providerTrackId],
      tokens.accessToken,
      env.YOUTUBE_API_KEY || undefined,
    );
    const video = videos[0];
    if (!video) {
      throw new TokenInvalidError('YouTube could not find that video.');
    }
    return mapVideo(video);
  }

  async getPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
  ): Promise<PlaylistResult & { tracks: TrackResult[] }> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlists = await providerJson<{ items?: YouTubePlaylistItem[] }>(
      `${YOUTUBE_API}/playlists?part=snippet,contentDetails&id=${encodeURIComponent(playlistId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    const playlist = playlists.items?.[0];
    if (!playlist) {
      throw new TokenInvalidError('YouTube playlist was not found.');
    }

    const videoIds: string[] = [];
    let pageToken: string | undefined;
    do {
      const pageUrl = new URL(`${YOUTUBE_API}/playlistItems`);
      pageUrl.searchParams.set('part', 'contentDetails');
      pageUrl.searchParams.set('playlistId', playlistId);
      pageUrl.searchParams.set('maxResults', '50');
      if (pageToken) {
        pageUrl.searchParams.set('pageToken', pageToken);
      }
      const page = await providerJson<{
        items?: Array<{ contentDetails?: { videoId?: string } }>;
        nextPageToken?: string;
      }>(pageUrl.toString(), { headers: bearerHeaders(accessToken) });
      for (const item of page.items ?? []) {
        if (item.contentDetails?.videoId) {
          videoIds.push(item.contentDetails.videoId);
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    const tracks: TrackResult[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const videos = await this.getVideos(chunk, accessToken, undefined);
      tracks.push(...videos.map(mapVideo));
    }

    return {
      provider: 'youtube',
      providerPlaylistId: playlist.id,
      name: playlist.snippet.title,
      description: playlist.snippet.description,
      coverImageUrl: playlist.snippet.thumbnails?.high?.url ?? playlist.snippet.thumbnails?.default?.url,
      trackCount: playlist.contentDetails?.itemCount,
      ownerName: playlist.snippet.channelTitle,
      tracks,
    };
  }

  async getUserPlaylists(tokens: ProviderTokens): Promise<PlaylistResult[]> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const data = await providerJson<{ items?: YouTubePlaylistItem[] }>(
      `${YOUTUBE_API}/playlists?part=snippet,contentDetails&mine=true&maxResults=50`,
      { headers: bearerHeaders(accessToken) },
    );
    return (data.items ?? []).map((playlist) => ({
      provider: 'youtube' as const,
      providerPlaylistId: playlist.id,
      name: playlist.snippet.title,
      description: playlist.snippet.description,
      coverImageUrl: playlist.snippet.thumbnails?.high?.url ?? playlist.snippet.thumbnails?.default?.url,
      trackCount: playlist.contentDetails?.itemCount,
      ownerName: playlist.snippet.channelTitle,
    }));
  }

  async createPlaylist(tokens: ProviderTokens, input: CreatePlaylistInput): Promise<PlaylistResult> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlist = await providerJson<YouTubePlaylistItem>(`${YOUTUBE_API}/playlists?part=snippet,status`, {
      method: 'POST',
      headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        snippet: {
          title: input.name,
          description: input.description ?? '',
        },
        status: {
          privacyStatus: input.isPublic ? 'public' : 'private',
        },
      }),
    });
    return {
      provider: 'youtube',
      providerPlaylistId: playlist.id,
      name: playlist.snippet.title,
      description: playlist.snippet.description,
      coverImageUrl: playlist.snippet.thumbnails?.high?.url,
    };
  }

  async addTracksToPlaylist(tokens: ProviderTokens, playlistId: string, trackIds: string[]): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    for (const videoId of trackIds) {
      await providerJson(`${YOUTUBE_API}/playlistItems?part=snippet`, {
        method: 'POST',
        headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        }),
      });
    }
  }

  async removeTracksFromPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    trackIds: string[],
  ): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const page = await providerJson<{
      items?: Array<{ id: string; contentDetails?: { videoId?: string } }>;
    }>(
      `${YOUTUBE_API}/playlistItems?part=id,contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`,
      { headers: bearerHeaders(accessToken) },
    );
    const wanted = new Set(trackIds);
    for (const item of page.items ?? []) {
      if (item.contentDetails?.videoId && wanted.has(item.contentDetails.videoId)) {
        await providerJson(`${YOUTUBE_API}/playlistItems?id=${encodeURIComponent(item.id)}`, {
          method: 'DELETE',
          headers: bearerHeaders(accessToken),
        });
      }
    }
  }

  async reorderPlaylist(
    _tokens: ProviderTokens,
    _playlistId: string,
    _input: ReorderPlaylistInput,
  ): Promise<void> {
    throw new ConfigurationError(
      'YouTube playlist reorder requires playlistItems.update with position; not enabled in this skeleton.',
    );
  }

  private async getVideos(
    ids: string[],
    accessToken: string | undefined,
    apiKey: string | undefined,
  ): Promise<YouTubeVideoItem[]> {
    const url = new URL(`${YOUTUBE_API}/videos`);
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('id', ids.join(','));
    if (accessToken) {
      url.searchParams.set('access_token', accessToken);
    } else if (apiKey) {
      url.searchParams.set('key', apiKey);
    } else {
      throw new TokenInvalidError('Connect YouTube to load video details.');
    }
    const data = await providerJson<{ items?: YouTubeVideoItem[] }>(url.toString());
    return data.items ?? [];
  }

  private async exchangeCode(code: string, codeVerifier?: string): Promise<ProviderTokens> {
    const env = this.requireConfig();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
    });
    if (codeVerifier) {
      body.set('code_verifier', codeVerifier);
    }
    const response = await providerJson<GoogleTokenResponse>(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (response.error) {
      throw new OAuthFailedError('Google did not accept the authorization code.');
    }
    return this.toTokens(response);
  }

  private toTokens(response: GoogleTokenResponse, fallbackRefresh?: string): ProviderTokens {
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? fallbackRefresh,
      expiresAt: new Date(Date.now() + response.expires_in * 1000),
      scopes: response.scope,
    };
  }

  private requireConfig() {
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new ConfigurationError(
        'YouTube/Google is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
      );
    }
    return env;
  }
}
