import type { AuthorizationRequest, ProviderTokens } from '../../types/provider';
import { OAuthFailedError, TokenInvalidError } from '../../types/errors';
import {
  AMAZON_MUSIC_SCOPE_STRING,
  LWA_AUTHORIZE_URL,
  type AmazonRuntimeConfig,
} from './amazonConfig';

export interface LwaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export function buildLwaAuthorizationUrl(
  config: Pick<AmazonRuntimeConfig, 'clientId' | 'redirectUri'>,
  state: string,
  scope = AMAZON_MUSIC_SCOPE_STRING,
): AuthorizationRequest {
  const url = new URL(LWA_AUTHORIZE_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('scope', scope);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  return { authorizationUrl: url.toString(), state };
}

export function lwaTokenRequestBody(input: {
  grantType: 'authorization_code' | 'refresh_token';
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  code?: string;
  refreshToken?: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    grant_type: input.grantType,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  if (input.grantType === 'authorization_code') {
    if (!input.code || !input.redirectUri) {
      throw new OAuthFailedError('Amazon Music authorization is missing a code or redirect URI.');
    }
    body.set('code', input.code);
    body.set('redirect_uri', input.redirectUri);
  } else {
    if (!input.refreshToken) {
      throw new TokenInvalidError('Amazon Music did not provide a refresh token. Please reconnect.');
    }
    body.set('refresh_token', input.refreshToken);
  }
  return body;
}

export function tokensFromLwaResponse(
  response: LwaTokenResponse,
  fallbackRefresh?: string,
): ProviderTokens {
  if (!response.access_token || typeof response.expires_in !== 'number') {
    throw new OAuthFailedError('Amazon Music did not return a usable access token.');
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? fallbackRefresh,
    expiresAt: new Date(Date.now() + response.expires_in * 1000),
    scopes: response.scope,
  };
}
