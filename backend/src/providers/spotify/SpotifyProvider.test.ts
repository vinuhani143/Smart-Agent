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
});
