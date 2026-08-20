process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);
process.env.SPOTIFY_CLIENT_ID = 'spotify-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'spotify-client-secret';
process.env.SPOTIFY_REDIRECT_URI = 'http://localhost:4000/api/auth/spotify/callback';

import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { resetEnvCache } from '../../config/env';
import { ErrorCode } from '../../types/errors';
import { SpotifyProvider } from './SpotifyProvider';

const originalFetch = globalThis.fetch;

before(() => {
  resetEnvCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('SpotifyProvider', () => {
  const provider = new SpotifyProvider();

  it('is enabled when official credentials are present', () => {
    assert.equal(provider.isEnabled(), true);
  });

  it('builds an authorize URL with PKCE and without the client secret', () => {
    const { authorizationUrl, state } = provider.getAuthorizationUrl('oauth-state', 'challenge-s256');
    const url = new URL(authorizationUrl);
    assert.equal(state, 'oauth-state');
    assert.equal(url.searchParams.get('client_id'), 'spotify-client-id');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), 'challenge-s256');
    assert.equal(url.searchParams.has('client_secret'), false);
    assert.equal(authorizationUrl.includes('spotify-client-secret'), false);
  });

  it('maps search results using Spotify track ids and does not invent ISRC values', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: '6rqhFgbbKwnb9MLmUQDhG6',
                name: 'Song',
                duration_ms: 200000,
                explicit: false,
                artists: [{ name: 'Artist' }],
                album: { name: 'Album', images: [{ url: 'https://i.scdn.co/image/ab' }], release_date: '1995' },
                external_ids: {},
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const tracks = await provider.searchTracks(
      { accessToken: 'spotify-access' },
      { query: 'తెలుగు' },
    );
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]?.provider, 'spotify');
    assert.equal(tracks[0]?.spotifyId, '6rqhFgbbKwnb9MLmUQDhG6');
    assert.equal(tracks[0]?.providerTrackId, '6rqhFgbbKwnb9MLmUQDhG6');
    assert.equal(tracks[0]?.isrc, undefined);
  });

  it('maps 401 from Spotify to an expired token without leaking the access token', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { status: 401, message: 'The access token expired' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () => provider.getCurrentUser({ accessToken: 'spotify-access' }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, ErrorCode.TOKEN_EXPIRED);
        assert.equal(error.message.includes('spotify-access'), false);
        return true;
      },
    );
  });

  it('refreshes with Basic auth and without client_id in the body', async () => {
    let tokenRequest: { url: string; auth: string | null; body: string } | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : '';
      tokenRequest = { url, auth: headers.get('authorization'), body };
      return new Response(
        JSON.stringify({
          access_token: 'rotated-access',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'user-read-email',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const tokens = await provider.refreshAccessToken({
      accessToken: 'expired-access',
      refreshToken: 'stored-refresh',
    });
    assert.equal(tokens.accessToken, 'rotated-access');
    assert.equal(tokens.refreshToken, 'stored-refresh');
    assert.ok(tokens.expiresAt && tokens.expiresAt.getTime() > Date.now());
    assert.ok(tokenRequest);
    assert.equal(tokenRequest.url, 'https://accounts.spotify.com/api/token');
    assert.equal(tokenRequest.auth?.startsWith('Basic '), true);
    assert.equal(tokenRequest.body.includes('grant_type=refresh_token'), true);
    assert.equal(tokenRequest.body.includes('refresh_token=stored-refresh'), true);
    assert.equal(tokenRequest.body.includes('client_id'), false);
    assert.equal(tokenRequest.body.includes('spotify-client-secret'), false);
    assert.equal(tokenRequest.body.includes('client_secret'), false);
  });

  it('maps a failed refresh to a reconnect error without leaking tokens', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token revoked' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () =>
        provider.refreshAccessToken({
          accessToken: 'expired-access',
          refreshToken: 'secret-refresh-token-value',
        }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, ErrorCode.TOKEN_INVALID);
        assert.match(error.message, /reconnect Spotify/i);
        assert.equal(error.message.includes('secret-refresh-token-value'), false);
        assert.equal(error.message.includes('spotify-client-secret'), false);
        assert.equal(error.message.includes('invalid_grant'), false);
        return true;
      },
    );
  });
});
