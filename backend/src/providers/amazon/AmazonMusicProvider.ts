import { ConfigurationError, NotFoundError, OAuthFailedError, TokenInvalidError } from '../../types/errors';
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
import { requireAccessToken } from '../http';
import { mapPool } from '../../utils/asyncPool';
import {
  AMAZON_MUSIC_SCOPE_STRING,
  LWA_REVOKE_URL,
  LWA_TOKEN_URL,
  isAmazonMusicUsable,
  type AmazonRuntimeConfig,
} from './amazonConfig';
import { buildLwaAuthorizationUrl, lwaTokenRequestBody, tokensFromLwaResponse, type LwaTokenResponse } from './amazonAuth';
import { amazonDisabledError, mapAmazonApiError } from './amazonErrors';
import { amazonApiHeaders, amazonJson } from './amazonHttp';
import {
  addTracksBody,
  createPlaylistBody,
  moveTracksBodyFromRange,
  normalizeAmazonPlaylist,
  normalizeAmazonTrack,
  normalizeAmazonUser,
  playlistsFromUserEdges,
  removeTracksBody,
  tracksFromPlaylistEdges,
  type AmazonMoveTracksBody,
  type AmazonPlaylistNode,
  type AmazonTrackNode,
  type AmazonUserNode,
} from './amazonNormalize';
import { getAmazonRuntimeConfig } from './amazonRuntime';

interface AmazonData<T> {
  data?: T;
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

export class AmazonMusicProvider implements MusicProvider {
  readonly id: ProviderId = 'amazon_music';
  readonly displayName = 'Amazon Music';

  constructor(private readonly readConfig: () => AmazonRuntimeConfig = getAmazonRuntimeConfig) {}

  isEnabled(): boolean {
    return isAmazonMusicUsable(this.readConfig());
  }

  getAuthorizationUrl(state: string, _codeChallenge?: string): AuthorizationRequest {
    const config = this.requireEnabledConfig();
    return buildLwaAuthorizationUrl(config, state, AMAZON_MUSIC_SCOPE_STRING);
  }

  async authenticate(code: string, _codeVerifier?: string): Promise<ProviderTokens & { user: ProviderUser }> {
    const tokens = await this.exchangeCode(code);
    const user = await this.getCurrentUser(tokens);
    return { ...tokens, user };
  }

  async logout(tokens: ProviderTokens): Promise<void> {
    const config = this.readConfig();
    if (!tokens.accessToken || !config.clientId) {
      return;
    }
    const body = new URLSearchParams({
      token: tokens.accessToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    try {
      await amazonJson(LWA_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      });
    } catch {
      // Local disconnect still proceeds if Amazon revoke fails.
    }
  }

  async refreshAccessToken(tokens: ProviderTokens): Promise<ProviderTokens> {
    const config = this.requireEnabledConfig();
    if (!tokens.refreshToken) {
      throw new TokenInvalidError('Amazon Music did not provide a refresh token. Please reconnect.');
    }
    const response = await amazonJson<LwaTokenResponse>(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: lwaTokenRequestBody({
        grantType: 'refresh_token',
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: tokens.refreshToken,
      }),
    });
    if (response.error) {
      const mapped = mapAmazonApiError(401, response);
      throw mapped ?? new TokenInvalidError('Amazon Music session could not be refreshed. Please reconnect.');
    }
    return tokensFromLwaResponse(response, tokens.refreshToken);
  }

  async getCurrentUser(tokens: ProviderTokens): Promise<ProviderUser> {
    const { accessToken, config } = this.authed(tokens);
    const json = await amazonJson<AmazonData<{ user?: AmazonUserNode }>>(`${config.apiBaseUrl}/v1/me`, {
      headers: amazonApiHeaders(accessToken, config.securityProfileId),
    });
    const user = json.data?.user ? normalizeAmazonUser(json.data.user) : null;
    if (!user) {
      throw new NotFoundError('Amazon Music did not return a user profile.');
    }
    return user;
  }

  async searchTracks(tokens: ProviderTokens | undefined, params: SearchTracksParams): Promise<TrackResult[]> {
    const { accessToken, config } = this.authed(tokens);
    const filters: Array<{ field?: string; query: string }> = [{ query: params.query.trim() }];
    if (params.language) {
      filters.push({ query: params.language });
    }
    if (params.genre) {
      filters.push({ query: params.genre });
    }
    const json = await amazonJson<AmazonData<{ searchTracks?: { edges?: Array<{ node?: AmazonTrackNode }> } }>>(
      `${config.apiBaseUrl}/v1/search/tracks`,
      {
        method: 'POST',
        headers: amazonApiHeaders(accessToken, config.securityProfileId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          searchFilters: filters.filter((item) => item.query.length > 0),
          limit: Math.min(Math.max(params.limit ?? 20, 1), 20),
          sortBy: 'relevance',
        }),
      },
    );
    const ids = (json.data?.searchTracks?.edges ?? [])
      .map((edge) => edge.node?.id)
      .filter((id): id is string => Boolean(id));
    const hydrated = await this.hydrateTracks(accessToken, config, ids);
    const fallback = (json.data?.searchTracks?.edges ?? [])
      .map((edge) => (edge.node ? normalizeAmazonTrack(edge.node) : null))
      .filter((track): track is TrackResult => track !== null);
    const byId = new Map(hydrated.map((track) => [track.providerTrackId, track]));
    const merged = fallback.map((track) => byId.get(track.providerTrackId) ?? track);
    return applyLocalFilters(merged, params);
  }

  async getTrack(tokens: ProviderTokens, providerTrackId: string): Promise<TrackResult> {
    const { accessToken, config } = this.authed(tokens);
    const json = await amazonJson<AmazonData<{ track?: AmazonTrackNode }>>(
      `${config.apiBaseUrl}/v1/tracks/${encodeURIComponent(providerTrackId)}`,
      { headers: amazonApiHeaders(accessToken, config.securityProfileId) },
    );
    const track = json.data?.track ? normalizeAmazonTrack(json.data.track) : null;
    if (!track) {
      throw new NotFoundError('That Amazon Music track was not found.');
    }
    return track;
  }

  async getPlaylistTracks(tokens: ProviderTokens, playlistId: string): Promise<TrackResult[]> {
    const { accessToken, config } = this.authed(tokens);
    const tracks: TrackResult[] = [];
    let cursor: string | undefined;
    do {
      const url = new URL(`${config.apiBaseUrl}/v1/playlists/${encodeURIComponent(playlistId)}/tracks`);
      url.searchParams.set('limit', '100');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      const json = await amazonJson<
        AmazonData<{ playlist?: { tracks?: { pageInfo?: { hasNextPage?: boolean; token?: string }; edges?: Array<{ cursor?: string; node?: AmazonTrackNode }> } } }>
      >(url.toString(), { headers: amazonApiHeaders(accessToken, config.securityProfileId) });
      const page = json.data?.playlist?.tracks;
      const pageTracks = tracksFromPlaylistEdges(page?.edges);
      const missing = pageTracks.filter((track) => !track.artist || !track.durationMs);
      if (missing.length > 0) {
        const hydrated = await this.hydrateTracks(
          accessToken,
          config,
          missing.map((track) => track.providerTrackId),
        );
        const byId = new Map(hydrated.map((track) => [track.providerTrackId, track]));
        for (const track of pageTracks) {
          const full = byId.get(track.providerTrackId);
          tracks.push(full ? { ...full, playlistEntryId: track.playlistEntryId } : track);
        }
      } else {
        tracks.push(...pageTracks);
      }
      cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.token : undefined;
    } while (cursor);
    return tracks;
  }

  async getPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
  ): Promise<PlaylistResult & { tracks: TrackResult[] }> {
    const { accessToken, config } = this.authed(tokens);
    const json = await amazonJson<AmazonData<{ playlist?: AmazonPlaylistNode }>>(
      `${config.apiBaseUrl}/v1/playlists/${encodeURIComponent(playlistId)}`,
      { headers: amazonApiHeaders(accessToken, config.securityProfileId) },
    );
    const playlist = json.data?.playlist ? normalizeAmazonPlaylist(json.data.playlist) : null;
    if (!playlist) {
      throw new NotFoundError('That Amazon Music playlist was not found.');
    }
    const tracks = await this.getPlaylistTracks(tokens, playlistId);
    return { ...playlist, tracks, trackCount: tracks.length };
  }

  async getUserPlaylists(tokens: ProviderTokens): Promise<PlaylistResult[]> {
    const { accessToken, config } = this.authed(tokens);
    const playlists: PlaylistResult[] = [];
    let cursor: string | undefined;
    do {
      const url = new URL(`${config.apiBaseUrl}/v1/me/playlists`);
      url.searchParams.set('limit', '100');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      const json = await amazonJson<
        AmazonData<{ user?: { playlists?: { pageInfo?: { hasNextPage?: boolean; token?: string }; edges?: Array<{ node?: AmazonPlaylistNode }> } } }>
      >(url.toString(), { headers: amazonApiHeaders(accessToken, config.securityProfileId) });
      const page = json.data?.user?.playlists;
      playlists.push(...playlistsFromUserEdges(page?.edges));
      cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.token : undefined;
    } while (cursor);
    return playlists;
  }

  async createPlaylist(tokens: ProviderTokens, input: CreatePlaylistInput): Promise<PlaylistResult> {
    const { accessToken, config } = this.authed(tokens);
    const json = await amazonJson<AmazonData<{ createPlaylist?: AmazonPlaylistNode }>>(
      `${config.apiBaseUrl}/v1/playlists`,
      {
        method: 'POST',
        headers: amazonApiHeaders(accessToken, config.securityProfileId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(createPlaylistBody(input)),
      },
    );
    const playlist = json.data?.createPlaylist ? normalizeAmazonPlaylist(json.data.createPlaylist) : null;
    if (!playlist) {
      throw new ConfigurationError('Amazon Music did not return the created playlist.');
    }
    return playlist;
  }

  async addTracksToPlaylist(tokens: ProviderTokens, playlistId: string, trackIds: string[]): Promise<void> {
    const { accessToken, config } = this.authed(tokens);
    for (let index = 0; index < trackIds.length; index += 50) {
      const chunk = trackIds.slice(index, index + 50);
      await amazonJson(`${config.apiBaseUrl}/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        method: 'PUT',
        headers: amazonApiHeaders(accessToken, config.securityProfileId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(addTracksBody(chunk, false)),
      });
    }
  }

  async removeTracksFromPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    trackIds: string[],
  ): Promise<void> {
    const { accessToken, config } = this.authed(tokens);
    const tracks = await this.getPlaylistTracks(tokens, playlistId);
    const wanted = new Set(trackIds);
    const entryIds = tracks
      .filter((track) => wanted.has(track.providerTrackId) || wanted.has(track.playlistEntryId ?? ''))
      .map((track) => track.playlistEntryId)
      .filter((id): id is string => Boolean(id));
    if (entryIds.length === 0) {
      return;
    }
    await amazonJson(`${config.apiBaseUrl}/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'DELETE',
      headers: amazonApiHeaders(accessToken, config.securityProfileId, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(removeTracksBody(entryIds)),
    });
  }

  async reorderPlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    input: ReorderPlaylistInput,
  ): Promise<void> {
    const { accessToken, config } = this.authed(tokens);
    let body: AmazonMoveTracksBody = {
      entryIds: input.entryIds ?? [],
      entryIdAbove: input.entryIdAbove,
      entryIdBelow: input.entryIdBelow,
    };
    if (body.entryIds.length === 0) {
      const tracks = await this.getPlaylistTracks(tokens, playlistId);
      body = moveTracksBodyFromRange(tracks, input);
    }
    if (body.entryIds.length === 0 || (!body.entryIdAbove && !body.entryIdBelow)) {
      throw new ConfigurationError(
        'Amazon Music reorder requires playlist entry IDs. Refresh the playlist and try again.',
      );
    }
    await amazonJson(`${config.apiBaseUrl}/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'PATCH',
      headers: amazonApiHeaders(accessToken, config.securityProfileId, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  }

  async updatePlaylist(
    tokens: ProviderTokens,
    playlistId: string,
    input: UpdatePlaylistInput,
  ): Promise<PlaylistResult> {
    const { accessToken, config } = this.authed(tokens);
    const existing = await this.getPlaylist(tokens, playlistId);
    const params = new URLSearchParams({
      title: input.name ?? existing.name,
      description: input.description ?? existing.description ?? '',
      visibility: 'PRIVATE',
    });
    const json = await amazonJson<AmazonData<{ updatePlaylist?: AmazonPlaylistNode }>>(
      `${config.apiBaseUrl}/v1/playlists/${encodeURIComponent(playlistId)}`,
      {
        method: 'PUT',
        headers: amazonApiHeaders(accessToken, config.securityProfileId, {
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: params,
      },
    );
    return json.data?.updatePlaylist
      ? normalizeAmazonPlaylist(json.data.updatePlaylist) ?? existing
      : { ...existing, name: input.name ?? existing.name, description: input.description ?? existing.description };
  }

  async deletePlaylist(tokens: ProviderTokens, playlistId: string): Promise<void> {
    const { accessToken, config } = this.authed(tokens);
    await amazonJson(`${config.apiBaseUrl}/v1/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
      headers: amazonApiHeaders(accessToken, config.securityProfileId),
    });
  }

  private async hydrateTracks(
    accessToken: string,
    config: AmazonRuntimeConfig,
    ids: string[],
  ): Promise<TrackResult[]> {
    if (ids.length === 0) {
      return [];
    }
    const unique = [...new Set(ids)];
    const chunks: string[][] = [];
    for (let index = 0; index < unique.length; index += 50) {
      chunks.push(unique.slice(index, index + 50));
    }
    const pages = await mapPool(chunks, 2, async (chunk) => {
      const url = new URL(`${config.apiBaseUrl}/v1/tracks`);
      url.searchParams.set('ids', chunk.join(','));
      const json = await amazonJson<AmazonData<{ tracks?: AmazonTrackNode[] }>>(url.toString(), {
        headers: amazonApiHeaders(accessToken, config.securityProfileId),
      });
      return (json.data?.tracks ?? [])
        .map((track) => normalizeAmazonTrack(track))
        .filter((track): track is TrackResult => track !== null);
    });
    return pages.flat();
  }

  private async exchangeCode(code: string): Promise<ProviderTokens> {
    const config = this.requireEnabledConfig();
    const response = await amazonJson<LwaTokenResponse>(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: lwaTokenRequestBody({
        grantType: 'authorization_code',
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
        code,
      }),
    });
    if (response.error) {
      const mapped = mapAmazonApiError(400, response);
      throw mapped ?? new OAuthFailedError('Amazon Music did not accept the authorization code.');
    }
    return tokensFromLwaResponse(response);
  }

  private authed(tokens: ProviderTokens | undefined): { accessToken: string; config: AmazonRuntimeConfig } {
    const config = this.requireEnabledConfig();
    return { accessToken: requireAccessToken(tokens?.accessToken), config };
  }

  private requireEnabledConfig(): AmazonRuntimeConfig {
    const config = this.readConfig();
    if (!isAmazonMusicUsable(config)) {
      throw amazonDisabledError();
    }
    return config;
  }
}
