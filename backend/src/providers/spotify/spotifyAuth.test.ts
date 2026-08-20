import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import {
  mapSpotifyTokenError,
  spotifyAuthorizationCodeBody,
  spotifyRefreshTokenBody,
  tokensFromSpotifyResponse,
} from './spotifyAuth';

describe('spotifyAuth', () => {
  it('builds a confidential-client refresh body without client_id or client_secret', () => {
    const body = spotifyRefreshTokenBody('stored-refresh');
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'stored-refresh');
    assert.equal(body.get('client_id'), null);
    assert.equal(body.get('client_secret'), null);
    assert.equal(body.toString().includes('client_id'), false);
  });

  it('maps invalid_grant to a reconnect error without leaking the refresh token', () => {
    assert.throws(
      () => mapSpotifyTokenError(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, ErrorCode.TOKEN_INVALID);
        assert.match(error.message, /reconnect Spotify/i);
        assert.equal(error.message.includes('Refresh token revoked'), false);
        return true;
      },
    );
  });

  it('builds a confidential-client authorization-code body with PKCE and without client_id', () => {
    const body = spotifyAuthorizationCodeBody({
      code: 'auth-code',
      redirectUri: 'https://musicmix-api.onrender.com/api/auth/spotify/callback',
      codeVerifier: 'verifier',
    });
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code_verifier'), 'verifier');
    assert.equal(body.get('client_id'), null);
    assert.equal(body.get('client_secret'), null);
    assert.equal(body.toString().includes('client_id'), false);
  });

  it('maps a failed authorization-code exchange without blaming refresh', () => {
    assert.throws(
      () => mapSpotifyTokenError(400, { error: 'invalid_grant' }, 'authorization_code'),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, ErrorCode.OAUTH_FAILED);
        assert.match(error.message, /SPOTIFY_REDIRECT_URI|authorization code/i);
        assert.equal(error.message.toLowerCase().includes('refresh'), false);
        return true;
      },
    );
  });

  it('parses a token response and keeps the previous refresh token when Spotify omits it', () => {
    const tokens = tokensFromSpotifyResponse(
      { access_token: 'new-access', expires_in: 3600, token_type: 'Bearer' },
      'previous-refresh',
    );
    assert.equal(tokens.accessToken, 'new-access');
    assert.equal(tokens.refreshToken, 'previous-refresh');
    assert.ok(tokens.expiresAt && tokens.expiresAt.getTime() > Date.now());
  });
});
