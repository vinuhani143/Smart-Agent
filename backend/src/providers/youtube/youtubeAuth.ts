import { OAuthFailedError, TokenInvalidError } from '../../types/errors';
import type { ProviderTokens } from '../../types/provider';

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export const YOUTUBE_OAUTH_SCOPES = ['https://www.googleapis.com/auth/youtube'];

export function mapGoogleTokenResponse(
  response: GoogleTokenResponse,
  fallbackRefresh?: string,
): ProviderTokens {
  if (response.error || !response.access_token || !response.expires_in) {
    if (response.error === 'invalid_grant') {
      throw new TokenInvalidError(
        'Your YouTube session could not be refreshed. Please reconnect YouTube.',
      );
    }
    throw new OAuthFailedError('Google did not accept the YouTube authorization code.');
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? fallbackRefresh,
    expiresAt: new Date(Date.now() + response.expires_in * 1000),
    scopes: response.scope ?? YOUTUBE_OAUTH_SCOPES.join(' '),
  };
}

export function buildYouTubePlaylistInsertBody(input: {
  name: string;
  description?: string;
  isPublic?: boolean;
}): Record<string, unknown> {
  return {
    snippet: {
      title: input.name,
      description: input.description ?? '',
    },
    status: {
      privacyStatus: input.isPublic ? 'public' : 'private',
    },
  };
}

export function youtubeInsertPosition(rangeStart: number, insertBefore: number): number {
  return insertBefore > rangeStart ? insertBefore - 1 : insertBefore;
}
