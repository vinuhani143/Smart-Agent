import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactLogMeta } from './logger';

describe('redactLogMeta', () => {
  it('redacts tokens and OAuth secrets by key name', () => {
    const redacted = redactLogMeta({
      refreshToken: 'secret-refresh',
      access_token: 'secret-access',
      authorization_code: 'oauth-code',
      client_secret: 'oauth-secret',
      path: '/api/playlists',
      requestId: 'req-1',
      statusCode: 200,
    }) as Record<string, unknown>;
    assert.equal(redacted.refreshToken, '[redacted]');
    assert.equal(redacted.access_token, '[redacted]');
    assert.equal(redacted.authorization_code, '[redacted]');
    assert.equal(redacted.client_secret, '[redacted]');
    assert.equal(redacted.path, '/api/playlists');
    assert.equal(redacted.requestId, 'req-1');
    assert.equal(redacted.statusCode, 200);
  });

  it('keeps safe Spotify token-exchange diagnostics while still redacting secrets', () => {
    const redacted = redactLogMeta({
      clientIdPresent: true,
      clientSecretPresent: true,
      redirectUri: 'https://musicmix-api.onrender.com/api/auth/spotify/callback',
      redirectUriLength: 62,
      codePresent: true,
      codeLength: 200,
      statePresent: true,
      verifierPresent: true,
      verifierLength: 43,
      grantType: 'authorization_code',
      contentType: 'application/x-www-form-urlencoded',
      authorizationScheme: 'Basic',
      spotifyTokenStatus: 400,
      spotifyTokenError: 'invalid_grant',
      spotifyTokenErrorDescription: 'Invalid authorization code',
      client_secret: 'must-not-appear',
      code_verifier: 'must-not-appear',
      access_token: 'must-not-appear',
    }) as Record<string, unknown>;
    assert.equal(redacted.clientSecretPresent, true);
    assert.equal(redacted.authorizationScheme, 'Basic');
    assert.equal(redacted.spotifyTokenStatus, 400);
    assert.equal(redacted.spotifyTokenError, 'invalid_grant');
    assert.equal(redacted.spotifyTokenErrorDescription, 'Invalid authorization code');
    assert.equal(redacted.client_secret, '[redacted]');
    assert.equal(redacted.code_verifier, '[redacted]');
    assert.equal(redacted.access_token, '[redacted]');
  });

  it('keeps Spotify search/refresh diagnostics while still redacting secrets', () => {
    const redacted = redactLogMeta({
      userIdPresent: true,
      spotifyAccountFound: true,
      providerUserIdPresent: true,
      accessTokenPresent: true,
      refreshTokenPresent: true,
      expiresAt: '2026-08-20T00:00:00.000Z',
      accessTokenExpired: false,
      refreshAttempted: true,
      spotifyRefreshStatus: 400,
      spotifyRefreshError: 'invalid_grant',
      spotifyRefreshErrorDescription: 'Refresh token revoked',
      spotifySearchStatus: 401,
      spotifySearchError: 'The access token expired',
      spotifySearchErrorDescription: 'The access token expired',
      spotifyRetryStatus: 200,
      spotifyRetryError: null,
      access_token: 'must-not-appear',
      refresh_token: 'must-not-appear',
    }) as Record<string, unknown>;
    assert.equal(redacted.userIdPresent, true);
    assert.equal(redacted.spotifyAccountFound, true);
    assert.equal(redacted.refreshAttempted, true);
    assert.equal(redacted.spotifyRefreshStatus, 400);
    assert.equal(redacted.spotifyRefreshError, 'invalid_grant');
    assert.equal(redacted.spotifySearchStatus, 401);
    assert.equal(redacted.spotifyRetryStatus, 200);
    assert.equal(redacted.access_token, '[redacted]');
    assert.equal(redacted.refresh_token, '[redacted]');
  });
});
