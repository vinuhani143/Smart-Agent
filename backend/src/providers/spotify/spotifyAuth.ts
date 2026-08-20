import {
  ConfigurationError,
  OAuthFailedError,
  SpotifyReconnectRequiredError,
} from '../../types/errors';
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

export type SpotifyTokenGrant = 'authorization_code' | 'refresh_token';

export type SpotifyOAuthErrorCode =
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_request'
  | 'unauthorized_client'
  | 'unsupported_grant_type';

export interface SpotifyTokenRequestDiagnostics {
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  redirectUri: string;
  redirectUriLength: number;
  codePresent: boolean;
  codeLength: number;
  statePresent: boolean;
  verifierPresent: boolean;
  verifierLength: number;
  grantType: SpotifyTokenGrant;
  contentType: 'application/x-www-form-urlencoded';
  bodyHasClientId?: boolean;
  bodyHasClientSecret?: boolean;
  authorizationScheme?: 'Basic' | 'none';
  clientIdHadWhitespace?: boolean;
  clientSecretHadWhitespace?: boolean;
  redirectUriHadWhitespace?: boolean;
}

export interface SpotifyAuthorizationCodeRequest {
  method: 'POST';
  url: string;
  headers: {
    Authorization: string;
    'Content-Type': 'application/x-www-form-urlencoded';
  };
  body: URLSearchParams;
  bodyKeys: string[];
  diagnostics: Required<SpotifyTokenRequestDiagnostics>;
}

export function trimSpotifyEnvValue(value: string): string {
  return value.trim();
}

export function spotifyBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${trimSpotifyEnvValue(clientId)}:${trimSpotifyEnvValue(clientSecret)}`).toString('base64')}`;
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
    redirect_uri: trimSpotifyEnvValue(input.redirectUri),
  });
  if (input.codeVerifier) {
    body.set('code_verifier', input.codeVerifier);
  }
  return body;
}

/** Single construction path for the authorization-code token request. */
export function buildAuthorizationCodeTokenRequest(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  statePresent?: boolean;
}): SpotifyAuthorizationCodeRequest {
  const clientId = trimSpotifyEnvValue(input.clientId);
  const clientSecret = trimSpotifyEnvValue(input.clientSecret);
  const redirectUri = trimSpotifyEnvValue(input.redirectUri);
  const body = spotifyAuthorizationCodeBody({
    code: input.code,
    redirectUri,
    codeVerifier: input.codeVerifier,
  });
  const headers = {
    Authorization: spotifyBasicAuthHeader(clientId, clientSecret),
    'Content-Type': 'application/x-www-form-urlencoded' as const,
  };
  return {
    method: 'POST',
    url: SPOTIFY_TOKEN_URL,
    headers,
    body,
    bodyKeys: [...body.keys()],
    diagnostics: {
      clientIdPresent: clientId.length > 0,
      clientSecretPresent: clientSecret.length > 0,
      redirectUri,
      redirectUriLength: redirectUri.length,
      codePresent: input.code.length > 0,
      codeLength: input.code.length,
      statePresent: input.statePresent ?? false,
      verifierPresent: input.codeVerifier.length > 0,
      verifierLength: input.codeVerifier.length,
      grantType: 'authorization_code',
      contentType: 'application/x-www-form-urlencoded',
      bodyHasClientId: body.has('client_id'),
      bodyHasClientSecret: body.has('client_secret'),
      authorizationScheme: 'Basic',
      clientIdHadWhitespace: input.clientId !== clientId,
      clientSecretHadWhitespace: input.clientSecret !== clientSecret,
      redirectUriHadWhitespace: input.redirectUri !== redirectUri,
    },
  };
}

function asSpotifyOAuthError(value: string | undefined): SpotifyOAuthErrorCode | undefined {
  if (
    value === 'invalid_client' ||
    value === 'invalid_grant' ||
    value === 'invalid_request' ||
    value === 'unauthorized_client' ||
    value === 'unsupported_grant_type'
  ) {
    return value;
  }
  return undefined;
}

function safeErrorDescription(description: string | undefined): string | undefined {
  if (!description) {
    return undefined;
  }
  if (description.length > 180) {
    return undefined;
  }
  if (/access_token|refresh_token|client_secret|code_verifier|bearer\s+[a-z0-9]/i.test(description)) {
    return undefined;
  }
  return description;
}

export function mapSpotifyTokenError(
  status: number,
  body: SpotifyTokenResponse | undefined,
  grantType: SpotifyTokenGrant = 'refresh_token',
): never {
  const spotifyError = asSpotifyOAuthError(typeof body?.error === 'string' ? body.error : undefined);
  const details = {
    diagnosticCode: spotifyError ? `SPOTIFY_${spotifyError.toUpperCase()}` : 'SPOTIFY_TOKEN_ERROR',
    spotifyError: spotifyError ?? 'unknown',
    grantType,
    httpStatus: status,
  };

  if (spotifyError === 'invalid_client' || spotifyError === 'unauthorized_client') {
    throw new ConfigurationError(
      `Spotify rejected the server credentials (${spotifyError}). Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET for whitespace.`,
      details,
    );
  }

  if (grantType === 'authorization_code') {
    if (spotifyError === 'invalid_grant') {
      throw new OAuthFailedError(
        'Spotify rejected the authorization code (invalid_grant). The code may be expired or already used, or the redirect URI / PKCE verifier did not match. Try Connect again.',
        details,
      );
    }
    if (spotifyError === 'invalid_request') {
      throw new OAuthFailedError(
        'Spotify rejected the token request (invalid_request). The token body must not include client_id when Basic authentication is used. Try Connect again.',
        details,
      );
    }
    if (spotifyError === 'unsupported_grant_type') {
      throw new OAuthFailedError(
        'Spotify rejected the token grant type (unsupported_grant_type).',
        details,
      );
    }
    throw new OAuthFailedError(
      `Spotify did not accept the authorization code (${details.spotifyError}). Try Connect again.`,
      details,
    );
  }

  if (spotifyError === 'invalid_grant' || body?.error === 'invalid_token') {
    throw new SpotifyReconnectRequiredError();
  }
  if (status === 400 || status === 401) {
    throw new SpotifyReconnectRequiredError();
  }
  throw new OAuthFailedError('Spotify did not accept the authorization request.', details);
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
 * Never logs access tokens, refresh tokens, client secret, code, or verifier.
 */
export async function requestSpotifyToken(
  body: URLSearchParams,
  headers: Record<string, string>,
  diagnostics?: Partial<SpotifyTokenRequestDiagnostics>,
): Promise<SpotifyTokenResponse> {
  const grantType: SpotifyTokenGrant =
    body.get('grant_type') === 'authorization_code' ? 'authorization_code' : 'refresh_token';
  logger.info('spotify token request', {
    clientIdPresent: diagnostics?.clientIdPresent ?? null,
    clientSecretPresent: diagnostics?.clientSecretPresent ?? null,
    redirectUri: diagnostics?.redirectUri ?? null,
    redirectUriLength: diagnostics?.redirectUriLength ?? diagnostics?.redirectUri?.length ?? null,
    codePresent: diagnostics?.codePresent ?? body.has('code'),
    codeLength: diagnostics?.codeLength ?? null,
    statePresent: diagnostics?.statePresent ?? null,
    verifierPresent: diagnostics?.verifierPresent ?? body.has('code_verifier'),
    verifierLength: diagnostics?.verifierLength ?? null,
    grantType,
    contentType: 'application/x-www-form-urlencoded',
    bodyHasClientId: body.has('client_id'),
    bodyHasClientSecret: body.has('client_secret'),
    authorizationScheme: headers.Authorization?.startsWith('Basic ') ? 'Basic' : 'none',
    clientIdHadWhitespace: diagnostics?.clientIdHadWhitespace ?? null,
    clientSecretHadWhitespace: diagnostics?.clientSecretHadWhitespace ?? null,
    redirectUriHadWhitespace: diagnostics?.redirectUriHadWhitespace ?? null,
  });
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
  const spotifyTokenError = typeof parsed?.error === 'string' ? parsed.error : undefined;
  logger.info('spotify token response', {
    grantType,
    spotifyTokenStatus: response.status,
    spotifyTokenError: spotifyTokenError ?? null,
    spotifyTokenErrorDescription: safeErrorDescription(parsed?.error_description) ?? null,
    ok: response.ok,
  });
  if (!response.ok) {
    mapSpotifyTokenError(response.status, parsed, grantType);
  }
  if (!parsed) {
    throw new OAuthFailedError('Spotify did not return a token response.');
  }
  return parsed;
}
