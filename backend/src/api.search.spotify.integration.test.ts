process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);
process.env.SPOTIFY_CLIENT_ID = 'spotify-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'spotify-client-secret';
process.env.SPOTIFY_REDIRECT_URI = 'http://localhost:4000/api/auth/spotify/callback';

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { resetEnvCache, loadEnv } from './config/env';
import { prisma } from './config/prisma';
import { createApp } from './app';
import { saveMusicAccount } from './services/TokenService';

resetEnvCache();
const env = loadEnv();
const app = createApp(env);

const originalFetch = globalThis.fetch;
let server: Server;
let base = '';
const createdUserIds: string[] = [];

const searchHit = {
  tracks: {
    items: [
      {
        id: '6rqhFgbbKwnb9MLmUQDhG6',
        name: 'Song',
        duration_ms: 180000,
        explicit: false,
        artists: [{ name: 'Artist' }],
        album: { name: 'Album', images: [{ url: 'https://i.scdn.co/image/ab' }] },
      },
    ],
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function installSpotifyFetchMock(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.startsWith(base) || url.includes('127.0.0.1') || url.includes('localhost')) {
      return originalFetch(input, init);
    }
    return handler(url, init);
  }) as typeof fetch;
}

async function json(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown>; raw: string }> {
  const response = await originalFetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const raw = await response.text();
  let body: Record<string, unknown> = {};
  if (raw) {
    body = JSON.parse(raw) as Record<string, unknown>;
  }
  return { status: response.status, body, raw };
}

async function createSession(): Promise<{ token: string; userId: string }> {
  const { status, body } = await json('/api/auth/session', { method: 'POST' });
  assert.equal(status, 200);
  const token = String(body.token);
  const userId = String(body.userId);
  createdUserIds.push(userId);
  return { token, userId };
}

async function connectSpotify(
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: Date },
): Promise<void> {
  await saveMusicAccount({
    userId,
    provider: 'spotify',
    user: { id: `sp-${userId}`, displayName: 'Listener' },
    tokens,
  });
}

function assertNoSecrets(raw: string): void {
  const lower = raw.toLowerCase();
  assert.equal(raw.includes('spotify-client-secret'), false);
  assert.equal(raw.includes('SPOTIFY_CLIENT_SECRET'), false);
  assert.equal(lower.includes('access_token'), false);
  assert.equal(raw.includes('accessToken'), false);
  assert.equal(raw.includes('refreshToken'), false);
  assert.equal(raw.includes('secret-refresh-token-value'), false);
  assert.equal(raw.includes('expired-access'), false);
  assert.equal(raw.includes('stale-access'), false);
  assert.equal(raw.includes('rotated-access'), false);
  assert.equal(raw.includes('valid-access'), false);
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await prisma.$disconnect();
});

describe('GET /api/search/spotify', () => {
  it('returns tracks when the stored access token is valid', async () => {
    const session = await createSession();
    await connectSpotify(session.userId, {
      accessToken: 'valid-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    let tokenCalls = 0;
    installSpotifyFetchMock((url, init) => {
      if (url.includes('/api/token')) {
        tokenCalls += 1;
        return jsonResponse(500, { error: 'should-not-refresh' });
      }
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer valid-access');
      return jsonResponse(200, searchHit);
    });

    const { status, body, raw } = await json(`/api/search/spotify?q=${encodeURIComponent('hello')}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(status, 200, raw);
    const tracks = body.tracks as Array<Record<string, unknown>>;
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]?.spotifyId, '6rqhFgbbKwnb9MLmUQDhG6');
    assert.equal(tokenCalls, 0);
    assertNoSecrets(raw);
  });

  it('refreshes an expired access token, persists it, and returns search results', async () => {
    const session = await createSession();
    await connectSpotify(session.userId, {
      accessToken: 'expired-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const calls: string[] = [];
    installSpotifyFetchMock((url, init) => {
      if (url.includes('/api/token')) {
        calls.push('token');
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
      const headers = new Headers(init?.headers);
      calls.push(headers.get('authorization') ?? '');
      return jsonResponse(200, searchHit);
    });

    const { status, body, raw } = await json(`/api/search/spotify?q=${encodeURIComponent('hello')}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(status, 200, raw);
    assert.deepEqual(calls, ['token', 'Bearer rotated-access']);
    const tracks = body.tracks as Array<Record<string, unknown>>;
    assert.equal(tracks.length, 1);
    assertNoSecrets(raw);

    const stored = await prisma.musicAccount.findUnique({
      where: { userId_provider: { userId: session.userId, provider: 'SPOTIFY' } },
    });
    assert.ok(stored);
    assert.notEqual(stored.accessToken, 'rotated-access');
    assert.ok(stored.expiresAt && stored.expiresAt.getTime() > Date.now());
  });

  it('retries once after Spotify search returns 401 and refresh succeeds', async () => {
    const session = await createSession();
    await connectSpotify(session.userId, {
      accessToken: 'stale-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    let searchCalls = 0;
    installSpotifyFetchMock((url, init) => {
      if (url.includes('/api/token')) {
        return jsonResponse(200, { access_token: 'rotated-access', expires_in: 3600, token_type: 'Bearer' });
      }
      searchCalls += 1;
      const headers = new Headers(init?.headers);
      if (headers.get('authorization') === 'Bearer stale-access') {
        return jsonResponse(401, { error: { status: 401, message: 'The access token expired' } });
      }
      assert.equal(headers.get('authorization'), 'Bearer rotated-access');
      return jsonResponse(200, searchHit);
    });

    const { status, body, raw } = await json(`/api/search/spotify?q=${encodeURIComponent('hello')}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(status, 200, raw);
    assert.equal(searchCalls, 2);
    const tracks = body.tracks as Array<Record<string, unknown>>;
    assert.equal(tracks.length, 1);
    assertNoSecrets(raw);
  });

  it('returns a reconnect error when refresh fails instead of a generic search failure', async () => {
    const session = await createSession();
    await connectSpotify(session.userId, {
      accessToken: 'expired-access',
      refreshToken: 'secret-refresh-token-value',
      expiresAt: new Date(Date.now() - 60_000),
    });
    installSpotifyFetchMock((url) => {
      if (url.includes('/api/token')) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' });
      }
      return jsonResponse(500, { error: 'search should not run' });
    });

    const { status, body, raw } = await json(`/api/search/spotify?q=${encodeURIComponent('hello')}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(status, 401, raw);
    const error = body.error as Record<string, unknown>;
    assert.equal(error.code, 'TOKEN_INVALID');
    assert.match(String(error.message), /reconnect Spotify/i);
    assert.equal(String(error.message).toLowerCase().includes('search failed'), false);
    assertNoSecrets(raw);
  });
});
