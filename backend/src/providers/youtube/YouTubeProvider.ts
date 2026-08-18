import { getEnv } from '../../config/env';
import {
  ConfigurationError,
  DuplicateTrackError,
  NotFoundError,
  OperationNotSupportedError,
  TokenInvalidError,
  TrackUnavailableError,
} from '../../types/errors';
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
  UpdatePlaylistInput,
} from '../../types/provider';
import { bearerHeaders, providerJson, requireAccessToken } from '../http';
import { parseIsoDurationMs, parseYouTubeTitle } from './parseYouTubeTitle';
import {
  buildYouTubePlaylistInsertBody,
  mapGoogleTokenResponse,
  YOUTUBE_OAUTH_SCOPES,
  type GoogleTokenResponse,
  youtubeInsertPosition,
} from './youtubeAuth';

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

interface YouTubeSearchItem {
  id?: { videoId?: string; kind?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
  };
}

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
  };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; embeddable?: boolean };
}

interface YouTubePlaylistResource {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
  };
  contentDetails?: { itemCount?: number };
}

interface YouTubePlaylistItemResource {
  id: string;
  snippet?: {
    title?: string;
    position?: number;
    resourceId?: { kind?: string; videoId?: string };
  };
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
  status?: { privacyStatus?: string };
}

interface YouTubeChannelResource {
  id: string;
  snippet?: {
    title?: string;
    thumbnails?: { high?: { url: string }; default?: { url: string } };
  };
}

function thumbnailUrl(thumbnails?: {
  high?: { url: string };
  medium?: { url: string };
  default?: { url: string };
}): string | undefined {
  return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
}

function mapVideo(item: YouTubeVideoItem): TrackResult {
  const rawTitle = item.snippet?.title ?? 'Untitled video';
  const channelTitle = item.snippet?.channelTitle ?? '';
  const parsed = parseYouTubeTitle(rawTitle, channelTitle);
  return {
    provider: 'youtube',
    providerTrackId: item.id,
    youtubeVideoId: item.id,
    title: parsed.title,
    artist: parsed.artist,
    durationMs: parseIsoDurationMs(item.contentDetails?.duration),
    releaseDate: item.snippet?.publishedAt,
    thumbnailUrl: thumbnailUrl(item.snippet?.thumbnails),
    originalTitle: parsed.originalTitle,
    metadataConfidence: parsed.confidence,
    parsedTitle: parsed.parsedTitle,
    parsedArtist: parsed.parsedArtist,
  };
}

function mapPlaylist(playlist: YouTubePlaylistResource): PlaylistResult {
  return {
    provider: 'youtube',
    providerPlaylistId: playlist.id,
    name: playlist.snippet?.title ?? 'Untitled playlist',
    description: playlist.snippet?.description,
    coverImageUrl: thumbnailUrl(playlist.snippet?.thumbnails),
    trackCount: playlist.contentDetails?.itemCount,
    ownerName: playlist.snippet?.channelTitle,
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

function youtubeAuth(
  accessToken: string | undefined,
  apiKey: string | undefined,
): { headers: Record<string, string>; query: URLSearchParams } {
  if (accessToken) {
    return { headers: bearerHeaders(accessToken), query: new URLSearchParams() };
  }
  if (apiKey) {
    const query = new URLSearchParams();
    query.set('key', apiKey);
    return { headers: {}, query };
  }
  return { headers: {}, query: new URLSearchParams() };
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
    url.searchParams.set('scope', YOUTUBE_OAUTH_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'false');
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
    const token = tokens.refreshToken ?? tokens.accessToken;
    const body = new URLSearchParams({ token });
    try {
      await providerJson(GOOGLE_REVOKE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      // Revoke is best-effort so disconnect still succeeds if Google already invalidated the token.
    }
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
    return mapGoogleTokenResponse(response, tokens.refreshToken);
  }

  async getCurrentUser(tokens: ProviderTokens): Promise<ProviderUser> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const data = await providerJson<{ items?: YouTubeChannelResource[] }>(
      `${YOUTUBE_API}/channels?part=snippet&mine=true`,
      { headers: bearerHeaders(accessToken) },
    );
    const channel = data.items?.[0];
    if (!channel) {
      throw new TokenInvalidError(
        'This Google account does not have a YouTube channel. Create one on YouTube, then reconnect.',
      );
    }
    return {
      id: channel.id,
      displayName: channel.snippet?.title ?? channel.id,
      imageUrl: channel.snippet?.thumbnails?.high?.url ?? channel.snippet?.thumbnails?.default?.url,
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
    url.searchParams.set('maxResults', String(Math.min(params.limit ?? 20, 50)));
    url.searchParams.set('q', queryParts.join(' '));
    const duration = durationFilterParam(params);
    if (duration) {
      url.searchParams.set('videoDuration', duration);
    }
    const accessToken = tokens?.accessToken;
    const auth = youtubeAuth(accessToken, env.YOUTUBE_API_KEY || undefined);
    if (!accessToken && !env.YOUTUBE_API_KEY) {
      throw new TokenInvalidError('Connect YouTube or configure YOUTUBE_API_KEY to search.');
    }
    for (const [key, value] of auth.query.entries()) {
      url.searchParams.set(key, value);
    }

    const search = await providerJson<{ items?: YouTubeSearchItem[] }>(url.toString(), {
      headers: auth.headers,
    });
    const ids = (search.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      return [];
    }
    const videos = await this.getVideos(ids, accessToken, env.YOUTUBE_API_KEY || undefined);
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
      throw new TrackUnavailableError(
        'This YouTube video is unavailable, private, or was deleted.',
      );
    }
    return mapVideo(video);
  }

  async getPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
  ): Promise<PlaylistResult & { tracks: TrackResult[] }> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlists = await providerJson<{ items?: YouTubePlaylistResource[] }>(
      `${YOUTUBE_API}/playlists?part=snippet,contentDetails,status&id=${encodeURIComponent(playlistId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    const playlist = playlists.items?.[0];
    if (!playlist) {
      throw new NotFoundError('That YouTube playlist was not found.');
    }

    const items = await this.listPlaylistItems(accessToken, playlistId);
    const videoIds = items
      .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId)
      .filter((id): id is string => Boolean(id));

    const tracks: TrackResult[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const videos = await this.getVideos(chunk, accessToken, undefined);
      const byId = new Map(videos.map((video) => [video.id, mapVideo(video)]));
      for (const id of chunk) {
        const mapped = byId.get(id);
        if (mapped) {
          tracks.push(mapped);
        }
      }
    }

    return { ...mapPlaylist(playlist), tracks };
  }

  async getUserPlaylists(tokens: ProviderTokens): Promise<PlaylistResult[]> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlists: PlaylistResult[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${YOUTUBE_API}/playlists`);
      url.searchParams.set('part', 'snippet,contentDetails,status');
      url.searchParams.set('mine', 'true');
      url.searchParams.set('maxResults', '50');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      const page = await providerJson<{ items?: YouTubePlaylistResource[]; nextPageToken?: string }>(
        url.toString(),
        { headers: bearerHeaders(accessToken) },
      );
      for (const playlist of page.items ?? []) {
        playlists.push(mapPlaylist(playlist));
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return playlists;
  }

  async createPlaylist(tokens: ProviderTokens, input: CreatePlaylistInput): Promise<PlaylistResult> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const playlist = await providerJson<YouTubePlaylistResource>(
      `${YOUTUBE_API}/playlists?part=snippet,status,contentDetails`,
      {
        method: 'POST',
        headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildYouTubePlaylistInsertBody(input)),
      },
    );
    return mapPlaylist(playlist);
  }

  async updatePlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    input: UpdatePlaylistInput,
  ): Promise<PlaylistResult> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const existing = await providerJson<{ items?: YouTubePlaylistResource[] }>(
      `${YOUTUBE_API}/playlists?part=snippet,status,contentDetails&id=${encodeURIComponent(playlistId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    const current = existing.items?.[0];
    if (!current) {
      throw new NotFoundError('That YouTube playlist was not found.');
    }
    const playlist = await providerJson<YouTubePlaylistResource>(`${YOUTUBE_API}/playlists?part=snippet,status`, {
      method: 'PUT',
      headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: playlistId,
        snippet: {
          title: input.name ?? current.snippet?.title ?? 'Playlist',
          description: input.description ?? current.snippet?.description ?? '',
        },
      }),
    });
    return mapPlaylist(playlist);
  }

  async deletePlaylist(tokens: ProviderTokens, playlistId: string): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    await providerJson(`${YOUTUBE_API}/playlists?id=${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
      headers: bearerHeaders(accessToken),
    });
  }

  async addTracksToPlaylist(tokens: ProviderTokens, playlistId: string, trackIds: string[]): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const existing = await this.listPlaylistItems(accessToken, playlistId);
    const already = new Set(
      existing
        .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId)
        .filter((id): id is string => Boolean(id)),
    );
    for (const videoId of trackIds) {
      if (already.has(videoId)) {
        throw new DuplicateTrackError('That YouTube video is already in this playlist.');
      }
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
      already.add(videoId);
    }
  }

  async removeTracksFromPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    trackIds: string[],
  ): Promise<void> {
    const accessToken = requireAccessToken(tokens.accessToken);
    const wanted = new Set(trackIds);
    const items = await this.listPlaylistItems(accessToken, playlistId);
    let removed = 0;
    for (const item of items) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (videoId && wanted.has(videoId)) {
        await providerJson(`${YOUTUBE_API}/playlistItems?id=${encodeURIComponent(item.id)}`, {
          method: 'DELETE',
          headers: bearerHeaders(accessToken),
        });
        removed += 1;
      }
    }
    if (removed === 0) {
      throw new NotFoundError('That video is not in this YouTube playlist.');
    }
  }

  async reorderPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    input: ReorderPlaylistInput,
  ): Promise<void> {
    const rangeLength = input.rangeLength ?? 1;
    if (rangeLength !== 1) {
      throw new OperationNotSupportedError(
        'YouTube playlist reorder supports moving one video at a time. Multi-item range moves are not supported because each YouTube playlistItems.update costs quota and a partial update could leave the playlist inconsistent.',
      );
    }
    const accessToken = requireAccessToken(tokens.accessToken);
    const items = await this.listPlaylistItems(accessToken, playlistId);
    const item = items[input.rangeStart];
    if (!item) {
      throw new NotFoundError('There is no video at that playlist position.');
    }
    const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
    if (!videoId) {
      throw new TrackUnavailableError('That playlist item no longer has a video id.');
    }
    const position = youtubeInsertPosition(input.rangeStart, input.insertBefore);
    await providerJson(`${YOUTUBE_API}/playlistItems?part=snippet`, {
      method: 'PUT',
      headers: bearerHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: item.id,
        snippet: {
          playlistId,
          position,
          resourceId: {
            kind: 'youtube#video',
            videoId,
          },
        },
      }),
    });
  }

  private async listPlaylistItems(
    accessToken: string,
    playlistId: string,
  ): Promise<YouTubePlaylistItemResource[]> {
    const items: YouTubePlaylistItemResource[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${YOUTUBE_API}/playlistItems`);
      url.searchParams.set('part', 'snippet,contentDetails,status');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('maxResults', '50');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      const page = await providerJson<{ items?: YouTubePlaylistItemResource[]; nextPageToken?: string }>(
        url.toString(),
        { headers: bearerHeaders(accessToken) },
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  private async getVideos(
    ids: string[],
    accessToken: string | undefined,
    apiKey: string | undefined,
  ): Promise<YouTubeVideoItem[]> {
    if (ids.length === 0) {
      return [];
    }
    const url = new URL(`${YOUTUBE_API}/videos`);
    url.searchParams.set('part', 'snippet,contentDetails,status');
    url.searchParams.set('id', ids.join(','));
    const auth = youtubeAuth(accessToken, apiKey);
    if (!accessToken && !apiKey) {
      throw new TokenInvalidError('Connect YouTube to load video details.');
    }
    for (const [key, value] of auth.query.entries()) {
      url.searchParams.set(key, value);
    }
    const data = await providerJson<{ items?: YouTubeVideoItem[] }>(url.toString(), {
      headers: auth.headers,
    });
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
    return mapGoogleTokenResponse(response);
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
