import { ConfigurationError, OAuthFailedError, TokenInvalidError } from '../../types/errors';
import type { ProviderTokens } from '../../types/provider';
import { logger } from '../../utils/logger';
import { providerFetch } from '../http';

export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

export interface SpotifyTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

const RECONNECT_SPOTIFY =
  'Your Spotify session could not be refreshed. Please reconnect Spotify in Settings.';

export type SpotifyTokenGrant = 'authorization_code' | 'refresh_token';

const CONNECT_SPOTIFY =
  'Spotify did not accept the authorization code. Confirm SPOTIFY_REDIRECT_URI matches the Spotify Dashboard exactly, then try Connect again.';

export function spotifyBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

/**
 * Confidential-client refresh: Basic auth only.
 * Do not also send client_id in the body — Spotify rejects that combination.
 */
export function spotifyRefreshTokenBody(refreshToken: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export function spotifyAuthorizationCodeBody(input: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  if (input.codeVerifier) {
    body.set('code_verifier', input.codeVerifier);
  }
  return body;
}

export function mapSpotifyTokenError(
  status: number,
  body: SpotifyTokenResponse | undefined,
  grantType: SpotifyTokenGrant = 'refresh_token',
): never {
  const code = typeof body?.error === 'string' ? body.error : undefined;
  if (code === 'invalid_client') {
    throw new ConfigurationError(
      'Spotify rejected the server credentials. Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.',
    );
  }
  if (grantType === 'authorization_code') {
    throw new OAuthFailedError(CONNECT_SPOTIFY);
  }
  if (code === 'invalid_grant' || code === 'invalid_token') {
    throw new TokenInvalidError(RECONNECT_SPOTIFY);
  }
  if (status === 400 || status === 401) {
    throw new TokenInvalidError(
      'Your Spotify session is no longer valid. Please reconnect Spotify in Settings.',
    );
  }
  throw new OAuthFailedError('Spotify did not accept the authorization request.');
}

export function tokensFromSpotifyResponse(
  response: SpotifyTokenResponse,
  fallbackRefresh?: string,
  grantType: SpotifyTokenGrant = 'refresh_token',
): ProviderTokens {
  const accessToken = response.access_token;
  const expiresIn = response.expires_in;
  if (response.error || !accessToken || typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
    mapSpotifyTokenError(400, response, grantType);
  }
  return {
    accessToken: accessToken as string,
    refreshToken: response.refresh_token ?? fallbackRefresh,
    expiresAt: new Date(Date.now() + (expiresIn as number) * 1000),
    scopes: response.scope,
  };
}

/**
 * POST to Spotify's token endpoint without the Google/YouTube error mapper.
 * Never logs access tokens, refresh tokens, or the client secret.
 */
export async function requestSpotifyToken(
  body: URLSearchParams,
  headers: Record<string, string>,
): Promise<SpotifyTokenResponse> {
  const grantType: SpotifyTokenGrant =
    body.get('grant_type') === 'authorization_code' ? 'authorization_code' : 'refresh_token';
  const response = await providerFetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers,
    body,
  });
  const raw = await response.text();
  let parsed: SpotifyTokenResponse | undefined;
  try {
    parsed = raw ? (JSON.parse(raw) as SpotifyTokenResponse) : undefined;
  } catch {
    parsed = undefined;
  }
  const errorCode = typeof parsed?.error === 'string' ? parsed.error : undefined;
  logger.info('spotify token exchange', {
    grantType,
    configured: true,
    httpStatus: response.status,
    ok: response.ok,
    errorCode: errorCode ?? null,
  });
  if (!response.ok) {
    mapSpotifyTokenError(response.status, parsed, grantType);
  }
  if (!parsed) {
    throw new OAuthFailedError('Spotify did not return a token response.');
  }
  return parsed;
}
