process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import { toPkceChallenge } from '../../utils/crypto';
import {
  buildAuthorizationCodeTokenRequest,
  mapSpotifyTokenError,
  requestSpotifyToken,
  spotifyAuthorizationCodeBody,
  spotifyRefreshTokenBody,
  tokensFromSpotifyResponse,
} from './spotifyAuth';

const originalFetch = globalThis.fetch;
const REDIRECT = 'https://musicmix-api.onrender.com/api/auth/spotify/callback';
const RFC7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC7636_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('spotifyAuth confidential token exchange', () => {
  it('RFC 7636 Appendix B: SHA256(code_verifier) then base64url equals the S256 challenge', () => {
    assert.equal(toPkceChallenge(RFC7636_VERIFIER), RFC7636_CHALLENGE);
  });

  it('builds POST https://accounts.spotify.com/api/token with Basic auth and no client credentials in the body', () => {
    const request = buildAuthorizationCodeTokenRequest({
      code: 'auth-code-from-spotify',
      redirectUri: REDIRECT,
      codeVerifier: RFC7636_VERIFIER,
      clientId: 'spotify-client-id',
      clientSecret: 'spotify-client-secret',
      statePresent: true,
    });

    assert.equal(request.method, 'POST');
    assert.equal(request.url, 'https://accounts.spotify.com/api/token');
    assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(
      request.headers.Authorization,
      `Basic ${Buffer.from('spotify-client-id:spotify-client-secret').toString('base64')}`,
    );
    assert.deepEqual(request.bodyKeys, ['grant_type', 'code', 'redirect_uri', 'code_verifier']);
    assert.equal(request.bodyKeys.includes('client_id'), false);
    assert.equal(request.bodyKeys.includes('client_secret'), false);
    assert.equal(request.body.get('grant_type'), 'authorization_code');
    assert.equal(request.body.get('code'), 'auth-code-from-spotify');
    assert.equal(request.body.get('redirect_uri'), REDIRECT);
    assert.equal(request.body.get('code_verifier'), RFC7636_VERIFIER);
    assert.equal(request.body.get('client_id'), null);
    assert.equal(request.body.get('client_secret'), null);
    assert.equal(request.diagnostics.bodyHasClientId, false);
    assert.equal(request.diagnostics.bodyHasClientSecret, false);
    assert.equal(request.diagnostics.authorizationScheme, 'Basic');
    assert.equal(request.diagnostics.grantType, 'authorization_code');
    assert.equal(request.diagnostics.contentType, 'application/x-www-form-urlencoded');
    assert.equal(request.diagnostics.redirectUri, request.body.get('redirect_uri'));
    assert.equal(request.diagnostics.clientIdPresent, true);
    assert.equal(request.diagnostics.clientSecretPresent, true);
    assert.equal(request.diagnostics.codePresent, true);
    assert.equal(request.diagnostics.codeLength, 'auth-code-from-spotify'.length);
    assert.equal(request.diagnostics.verifierPresent, true);
    assert.equal(request.diagnostics.verifierLength, RFC7636_VERIFIER.length);
    assert.equal(request.diagnostics.statePresent, true);
    assert.equal(JSON.stringify(request.diagnostics).includes('spotify-client-secret'), false);
    assert.equal(JSON.stringify(request.diagnostics).includes(RFC7636_VERIFIER), false);
    assert.equal(JSON.stringify(request.diagnostics).includes('auth-code-from-spotify'), false);
  });

  it('trims whitespace and newlines from Render env values before Basic encoding', () => {
    const request = buildAuthorizationCodeTokenRequest({
      code: 'code',
      redirectUri: `${REDIRECT}\n`,
      codeVerifier: 'verifier',
      clientId: 'spotify-client-id\n',
      clientSecret: '  spotify-client-secret\r\n',
    });

    assert.equal(
      request.headers.Authorization,
      `Basic ${Buffer.from('spotify-client-id:spotify-client-secret').toString('base64')}`,
    );
    assert.equal(request.body.get('redirect_uri'), REDIRECT);
    assert.equal(request.diagnostics.clientIdHadWhitespace, true);
    assert.equal(request.diagnostics.clientSecretHadWhitespace, true);
    assert.equal(request.diagnostics.redirectUriHadWhitespace, true);
  });

  it('builds a confidential-client refresh body without client_id or client_secret', () => {
    const body = spotifyRefreshTokenBody('stored-refresh');
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'stored-refresh');
    assert.equal(body.get('client_id'), null);
    assert.equal(body.get('client_secret'), null);
    assert.equal(body.toString().includes('client_id'), false);
  });

  it('builds a confidential-client authorization-code body with PKCE and without client_id', () => {
    const body = spotifyAuthorizationCodeBody({
      code: 'auth-code',
      redirectUri: REDIRECT,
      codeVerifier: 'verifier',
    });
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code_verifier'), 'verifier');
    assert.equal(body.get('client_id'), null);
    assert.equal(body.get('client_secret'), null);
    assert.deepEqual([...body.keys()], ['grant_type', 'code', 'redirect_uri', 'code_verifier']);
  });

  it('maps invalid_grant on authorization_code without the generic credentials message', () => {
    assert.throws(
      () => mapSpotifyTokenError(400, { error: 'invalid_grant', error_description: 'Invalid authorization code' }, 'authorization_code'),
      (error: Error & { code?: string; details?: Record<string, unknown> }) => {
        assert.equal(error.code, ErrorCode.OAUTH_FAILED);
        assert.equal(error.details?.spotifyError, 'invalid_grant');
        assert.equal(error.details?.diagnosticCode, 'SPOTIFY_INVALID_GRANT');
        assert.match(error.message, /invalid_grant/);
        assert.equal(error.message.includes('Check the provider credentials'), false);
        assert.equal(error.message.toLowerCase().includes('refresh'), false);
        return true;
      },
    );
  });

  it('maps invalid_request distinctly from invalid_grant', () => {
    assert.throws(
      () => mapSpotifyTokenError(400, { error: 'invalid_request', error_description: 'code_verifier required' }, 'authorization_code'),
      (error: Error & { details?: Record<string, unknown> }) => {
        assert.equal(error.details?.spotifyError, 'invalid_request');
        assert.equal(error.details?.diagnosticCode, 'SPOTIFY_INVALID_REQUEST');
        assert.match(error.message, /invalid_request/);
        return true;
      },
    );
  });

  it('maps unsupported_grant_type on the authorization-code path', () => {
    assert.throws(
      () => mapSpotifyTokenError(400, { error: 'unsupported_grant_type' }, 'authorization_code'),
      (error: Error & { details?: Record<string, unknown> }) => {
        assert.equal(error.details?.spotifyError, 'unsupported_grant_type');
        assert.equal(error.details?.diagnosticCode, 'SPOTIFY_UNSUPPORTED_GRANT_TYPE');
        return true;
      },
    );
  });

  it('maps invalid_client to a configuration error with a diagnostic code', () => {
    assert.throws(
      () => mapSpotifyTokenError(401, { error: 'invalid_client', error_description: 'Invalid client' }, 'authorization_code'),
      (error: Error & { code?: string; details?: Record<string, unknown> }) => {
        assert.equal(error.code, ErrorCode.CONFIGURATION_ERROR);
        assert.equal(error.details?.spotifyError, 'invalid_client');
        assert.equal(error.details?.diagnosticCode, 'SPOTIFY_INVALID_CLIENT');
        assert.match(error.message, /invalid_client/);
        return true;
      },
    );
  });

  it('maps unauthorized_client distinctly from invalid_client', () => {
    assert.throws(
      () => mapSpotifyTokenError(400, { error: 'unauthorized_client' }, 'authorization_code'),
      (error: Error & { details?: Record<string, unknown> }) => {
        assert.equal(error.details?.spotifyError, 'unauthorized_client');
        assert.equal(error.details?.diagnosticCode, 'SPOTIFY_UNAUTHORIZED_CLIENT');
        return true;
      },
    );
  });

  it('maps invalid_grant on refresh to a reconnect error without leaking the refresh token', () => {
    assert.throws(
      () => mapSpotifyTokenError(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, ErrorCode.SPOTIFY_RECONNECT_REQUIRED);
        assert.match(error.message, /Reconnect Spotify/i);
        assert.equal(error.message.includes('Refresh token revoked'), false);
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

  it('POSTs the exact confidential-client token request and maps Spotify invalid_grant from the response', async () => {
    let captured: { method?: string; contentType: string | null; authorization: string | null; body: string } | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      captured = {
        method: init?.method,
        contentType: headers.get('content-type'),
        authorization: headers.get('authorization'),
        body:
          typeof init?.body === 'string'
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : '',
      };
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid authorization code' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const request = buildAuthorizationCodeTokenRequest({
      code: 'already-used-code',
      redirectUri: REDIRECT,
      codeVerifier: RFC7636_VERIFIER,
      clientId: 'spotify-client-id',
      clientSecret: 'spotify-client-secret',
      statePresent: true,
    });

    await assert.rejects(
      () => requestSpotifyToken(request.body, request.headers, request.diagnostics),
      (error: Error & { code?: string; details?: Record<string, unknown> }) => {
        assert.equal(error.code, ErrorCode.OAUTH_FAILED);
        assert.equal(error.details?.spotifyError, 'invalid_grant');
        assert.equal(error.message.includes('Check the provider credentials'), false);
        return true;
      },
    );

    assert.ok(captured);
    assert.equal(captured.method, 'POST');
    assert.equal(captured.contentType, 'application/x-www-form-urlencoded');
    assert.equal(
      captured.authorization,
      `Basic ${Buffer.from('spotify-client-id:spotify-client-secret').toString('base64')}`,
    );
    const params = new URLSearchParams(captured.body);
    assert.deepEqual([...params.keys()], ['grant_type', 'code', 'redirect_uri', 'code_verifier']);
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('redirect_uri'), REDIRECT);
    assert.equal(params.get('code_verifier'), RFC7636_VERIFIER);
    assert.equal(params.get('client_id'), null);
    assert.equal(params.get('client_secret'), null);
  });
});
