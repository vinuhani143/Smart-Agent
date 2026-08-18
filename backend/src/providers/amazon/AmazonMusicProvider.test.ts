import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import type { ProviderTokens } from '../../types/provider';
import { AmazonMusicProvider } from './AmazonMusicProvider';
import { AMAZON_MUSIC_SCOPE_STRING, AMAZON_MUSIC_UNAVAILABLE_MESSAGE, LWA_AUTHORIZE_URL } from './amazonConfig';

const originalFetch = globalThis.fetch;

const enabledConfig = {
  featureEnabled: true,
  clientId: 'amzn1.application-oa2-client.test',
  clientSecret: 'test-secret',
  securityProfileId: 'amzn1.application.test-profile',
  redirectUri: 'http://localhost:4000/api/auth/amazon/callback',
  apiBaseUrl: 'https://api.music.amazon.dev',
};

const tokens: ProviderTokens = {
  accessToken: 'Atza|access',
  refreshToken: 'Atzr|refresh',
  expiresAt: new Date(Date.now() + 60_000),
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('AmazonMusicProvider disabled state', () => {
  const provider = new AmazonMusicProvider(() => ({
    ...enabledConfig,
    featureEnabled: false,
  }));

  it('stays disabled without pretending Amazon is live', () => {
    assert.equal(provider.isEnabled(), false);
  });

  it('refuses Amazon requests with the official unavailable message', async () => {
    await assert.rejects(
      () => provider.searchTracks(tokens, { query: 'telugu romantic' }),
      (error: Error & { code?: string }) =>
        error.code === ErrorCode.PROVIDER_UNAVAILABLE && error.message === AMAZON_MUSIC_UNAVAILABLE_MESSAGE,
    );
    await assert.rejects(() => provider.createPlaylist(tokens, { name: 'Mine' }));
  });
});

describe('AmazonMusicProvider official API adapter', () => {
  const provider = new AmazonMusicProvider(() => enabledConfig);

  it('is enabled only with flag + credentials', () => {
    assert.equal(provider.isEnabled(), true);
  });

  it('builds Login With Amazon URL without exposing the client secret', () => {
    const { authorizationUrl } = provider.getAuthorizationUrl('state-1');
    const url = new URL(authorizationUrl);
    assert.equal(`${url.origin}${url.pathname}`, LWA_AUTHORIZE_URL);
    assert.equal(url.searchParams.get('scope'), AMAZON_MUSIC_SCOPE_STRING);
    assert.equal(url.searchParams.get('client_id'), enabledConfig.clientId);
    assert.equal(url.searchParams.has('client_secret'), false);
    assert.equal(authorizationUrl.includes('test-secret'), false);
  });

  it('creates a PRIVATE playlist through POST /v1/playlists', async () => {
    const calls: Array<{ url: string; method: string; body: string }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        method: String(init?.method ?? 'GET'),
        body: typeof init?.body === 'string' ? init.body : String(init?.body ?? ''),
      });
      return new Response(
        JSON.stringify({ data: { createPlaylist: { id: 'pl1', title: 'Telugu mix', visibility: 'PRIVATE' } } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const playlist = await provider.createPlaylist(tokens, { name: 'Telugu mix', description: 'Notes' });
    assert.equal(playlist.providerPlaylistId, 'pl1');
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.url, 'https://api.music.amazon.dev/v1/playlists');
    assert.deepEqual(JSON.parse(calls[0]?.body ?? '{}'), {
      title: 'Telugu mix',
      description: 'Notes',
      visibility: 'PRIVATE',
    });
  });

  it('adds catalog track IDs with PUT /tracks', async () => {
    let body = '';
    globalThis.fetch = (async (_input, init) => {
      body = typeof init?.body === 'string' ? init.body : '';
      return new Response(undefined, { status: 204 });
    }) as typeof fetch;
    await provider.addTracksToPlaylist(tokens, 'pl1', ['B0TRACK1']);
    assert.deepEqual(JSON.parse(body), { trackIds: ['B0TRACK1'], addDuplicateTracks: false });
  });

  it('removes playlist entry IDs, not catalog track IDs', async () => {
    const bodies: string[] = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      bodies.push(body);
      if (url.includes('/tracks') && (init?.method ?? 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            data: {
              playlist: {
                tracks: {
                  pageInfo: { hasNextPage: false },
                  edges: [{ cursor: 'B0TRACK1:entry-1', node: { id: 'B0TRACK1', title: 'Song', duration: 200 } }],
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(undefined, { status: 204 });
    }) as typeof fetch;

    await provider.removeTracksFromPlaylist(tokens, 'pl1', ['B0TRACK1']);
    const deleteBody = bodies.find((item) => item.includes('entryIds'));
    assert.ok(deleteBody);
    assert.deepEqual(JSON.parse(deleteBody), { entryIds: ['entry-1'] });
  });

  it('reorders with PATCH entry IDs', async () => {
    let patchBody = '';
    globalThis.fetch = (async (input, init) => {
      if (String(init?.method) === 'PATCH') {
        patchBody = typeof init?.body === 'string' ? init.body : '';
        return new Response(undefined, { status: 204 });
      }
      return new Response(
        JSON.stringify({
          data: {
            playlist: {
              tracks: {
                pageInfo: { hasNextPage: false },
                edges: [
                  { cursor: 't1:e1', node: { id: 't1', title: 'A', duration: 100 } },
                  { cursor: 't2:e2', node: { id: 't2', title: 'B', duration: 100 } },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    await provider.reorderPlaylist(tokens, 'pl1', { rangeStart: 1, insertBefore: 0 });
    const parsed = JSON.parse(patchBody) as { entryIds: string[]; entryIdBelow?: string };
    assert.deepEqual(parsed.entryIds, ['e2']);
    assert.equal(parsed.entryIdBelow, 'e1');
  });
});
