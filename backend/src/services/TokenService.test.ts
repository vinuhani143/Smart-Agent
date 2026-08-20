process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);
process.env.SPOTIFY_CLIENT_ID = 'spotify-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'spotify-client-secret';
process.env.SPOTIFY_REDIRECT_URI = 'http://localhost:4000/api/auth/spotify/callback';

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { resetEnvCache } from '../config/env';
import { prisma } from '../config/prisma';
import { ErrorCode } from '../types/errors';
import { createAnonymousAccount } from './AccountService';
import { searchProvider } from './SearchService';
import {
  getStoredAccount,
  needsAccessTokenRefresh,
  saveMusicAccount,
} from './TokenService';

const originalFetch = globalThis.fetch;
const userIds: string[] = [];

before(() => {
  resetEnvCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const searchHit = {
  tracks: {
    items: [
      {
        id: '6rqhFgbbKwnb9MLmUQDhG6',
        name: 'Song',
        duration_ms: 180000,
        explicit: false,
        artists: [{ name: 'Artist' }],
        album: { name: 'Album' },
      },
    ],
  },
};

describe('needsAccessTokenRefresh', () => {
  it('refreshes when expiry is missing or already past', () => {
    assert.equal(needsAccessTokenRefresh({ accessToken: 'a' }), false);
    assert.equal(
      needsAccessTokenRefresh({
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      }),
      false,
    );
    assert.equal(needsAccessTokenRefresh({ accessToken: 'a', refreshToken: 'r' }), true);
    assert.equal(
      needsAccessTokenRefresh({
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() - 1000),
      }),
      true,
    );
    assert.equal(needsAccessTokenRefresh({ accessToken: '', refreshToken: 'r' }), true);
    assert.equal(
      needsAccessTokenRefresh({
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.sig',
        refreshToken: 'r',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      }),
      true,
    );
  });
});

describe('withProviderTokens Spotify refresh', () => {
  async function seedAccount(tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }) {
    const session = await createAnonymousAccount();
    userIds.push(session.userId);
    await saveMusicAccount({
      userId: session.userId,
      provider: 'spotify',
      user: { id: `sp-${session.userId}`, displayName: 'Listener' },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });
    return session.userId;
  }

  it('uses a valid access token without calling the token endpoint', async () => {
    const userId = await seedAccount({
      accessToken: 'valid-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    let tokenCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/token')) {
        tokenCalls += 1;
        return jsonResponse(500, { error: 'should-not-refresh' });
      }
      return jsonResponse(200, searchHit);
    }) as typeof fetch;

    const tracks = await searchProvider(userId, 'spotify', { query: 'hello' });
    assert.equal(tracks.length, 1);
    assert.equal(tokenCalls, 0);
  });

  it('refreshes an expired access token, persists the new token, and searches', async () => {
    const userId = await seedAccount({
      accessToken: 'expired-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      if (url.includes('/api/token')) {
        seen.push('token');
        const body =
          typeof init?.body === 'string'
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : '';
        assert.equal(body.includes('client_id'), false);
        assert.equal(body.includes('spotify-client-secret'), false);
        return jsonResponse(200, { access_token: 'rotated-access', expires_in: 3600, token_type: 'Bearer' });
      }
      seen.push(headers.get('authorization') ?? '');
      return jsonResponse(200, searchHit);
    }) as typeof fetch;

    const tracks = await searchProvider(userId, 'spotify', { query: 'hello' });
    assert.equal(tracks.length, 1);
    assert.deepEqual(seen, ['token', 'Bearer rotated-access']);
    const stored = await getStoredAccount(userId, 'spotify');
    assert.equal(stored?.tokens.accessToken, 'rotated-access');
    assert.equal(stored?.tokens.refreshToken, 'stored-refresh');
    assert.ok(stored?.tokens.expiresAt && stored.tokens.expiresAt.getTime() > Date.now());
  });

  it('retries search once after Spotify returns 400 bearer auth failure and refresh succeeds', async () => {
    const userId = await seedAccount({
      accessToken: 'stale-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    let searchCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      if (url.includes('/api/token')) {
        const body =
          typeof init?.body === 'string'
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : '';
        assert.equal(body.includes('code_verifier'), false);
        assert.equal(headers.get('authorization')?.startsWith('Basic '), true);
        return jsonResponse(200, { access_token: 'rotated-access', expires_in: 3600, token_type: 'Bearer' });
      }
      searchCalls += 1;
      const authorization = headers.get('authorization') ?? '';
      assert.equal(authorization.startsWith('Bearer '), true);
      assert.equal(authorization.startsWith('Basic '), false);
      if (authorization === 'Bearer stale-access') {
        return jsonResponse(400, {
          error: { status: 400, message: 'Only valid bearer authentication supported' },
        });
      }
      return jsonResponse(200, searchHit);
    }) as typeof fetch;

    const tracks = await searchProvider(userId, 'spotify', { query: 'naatu' });
    assert.equal(tracks.length, 1);
    assert.equal(searchCalls, 2);
    const stored = await getStoredAccount(userId, 'spotify');
    assert.equal(stored?.tokens.accessToken, 'rotated-access');
  });

  it('retries search once after Spotify returns 401 and refresh succeeds', async () => {
    const userId = await seedAccount({
      accessToken: 'stale-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    let searchCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      if (url.includes('/api/token')) {
        return jsonResponse(200, { access_token: 'rotated-access', expires_in: 3600, token_type: 'Bearer' });
      }
      searchCalls += 1;
      if (headers.get('authorization') === 'Bearer stale-access') {
        return jsonResponse(401, { error: { status: 401, message: 'The access token expired' } });
      }
      return jsonResponse(200, searchHit);
    }) as typeof fetch;

    const tracks = await searchProvider(userId, 'spotify', { query: 'hello' });
    assert.equal(tracks.length, 1);
    assert.equal(searchCalls, 2);
    const stored = await getStoredAccount(userId, 'spotify');
    assert.equal(stored?.tokens.accessToken, 'rotated-access');
  });

  it('returns a reconnect error when refresh fails and never leaks tokens', async () => {
    const userId = await seedAccount({
      accessToken: 'expired-access',
      refreshToken: 'secret-refresh-token-value',
      expiresAt: new Date(Date.now() - 60_000),
    });
    globalThis.fetch = (async () =>
      jsonResponse(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' })) as typeof fetch;

    await assert.rejects(
      () => searchProvider(userId, 'spotify', { query: 'hello' }),
      (error: Error & { code?: string; statusCode?: number }) => {
        assert.equal(error.code, ErrorCode.SPOTIFY_RECONNECT_REQUIRED);
        assert.equal(error.statusCode, 401);
        assert.equal(error.message, 'Reconnect Spotify.');
        assert.equal(error.message.includes('secret-refresh-token-value'), false);
        assert.equal(error.message.includes('spotify-client-secret'), false);
        assert.equal(error.message.includes('expired-access'), false);
        assert.equal(error.message.toLowerCase().includes('search failed'), false);
        return true;
      },
    );
  });

  it('refreshes instead of sending ciphertext when access-token decrypt fails', async () => {
    const userId = await seedAccount({
      accessToken: 'valid-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    await prisma.musicAccount.update({
      where: { userId_provider: { userId, provider: 'SPOTIFY' } },
      data: { accessToken: 'not-a-valid.cipher.text' },
    });
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      const authorization = headers.get('authorization') ?? '';
      assert.equal(authorization.includes('not-a-valid.cipher.text'), false);
      if (url.includes('/api/token')) {
        seen.push('token');
        const body =
          typeof init?.body === 'string'
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : '';
        assert.equal(body.includes('code_verifier'), false);
        assert.equal(body.includes('grant_type=refresh_token'), true);
        return jsonResponse(200, { access_token: 'rotated-access', expires_in: 3600, token_type: 'Bearer' });
      }
      seen.push(authorization);
      return jsonResponse(200, searchHit);
    }) as typeof fetch;

    const tracks = await searchProvider(userId, 'spotify', { query: 'naatu' });
    assert.equal(tracks.length, 1);
    assert.deepEqual(seen, ['token', 'Bearer rotated-access']);
  });

  it('searches only the MusicAccount owned by the MusicMix session userId', async () => {
    const ownerId = await seedAccount({
      accessToken: 'owner-access',
      refreshToken: 'owner-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    const other = await createAnonymousAccount();
    userIds.push(other.userId);
    let usedOwnerToken = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get('authorization') === 'Bearer owner-access') {
        usedOwnerToken = true;
      }
      return jsonResponse(200, searchHit);
    }) as typeof fetch;

    await assert.rejects(
      () => searchProvider(other.userId, 'spotify', { query: 'naatu' }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, ErrorCode.TOKEN_INVALID);
        assert.match(error.message, /Connect Spotify/i);
        return true;
      },
    );
    assert.equal(usedOwnerToken, false);
    const owner = await getStoredAccount(ownerId, 'spotify');
    assert.equal(owner?.tokens.accessToken, 'owner-access');
  });

  it('moves an existing Spotify identity onto the current MusicMix user', async () => {
    const first = await createAnonymousAccount();
    const second = await createAnonymousAccount();
    userIds.push(first.userId, second.userId);
    await saveMusicAccount({
      userId: first.userId,
      provider: 'spotify',
      user: { id: 'same-spotify-user', displayName: 'Listener' },
      tokens: { accessToken: 'first-access', refreshToken: 'first-refresh', expiresAt: new Date(Date.now() + 3600_000) },
    });
    await saveMusicAccount({
      userId: second.userId,
      provider: 'spotify',
      user: { id: 'same-spotify-user', displayName: 'Listener' },
      tokens: { accessToken: 'second-access', refreshToken: 'second-refresh', expiresAt: new Date(Date.now() + 3600_000) },
    });
    assert.equal(await getStoredAccount(first.userId, 'spotify'), null);
    const moved = await getStoredAccount(second.userId, 'spotify');
    assert.equal(moved?.tokens.accessToken, 'second-access');
    assert.equal(moved?.providerUserId, 'same-spotify-user');
  });
});
