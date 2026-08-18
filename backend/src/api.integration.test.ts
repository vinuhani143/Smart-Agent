process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { loadEnv } from './config/env';
import { prisma } from './config/prisma';
import { createApp } from './app';

const env = loadEnv();
const app = createApp(env);

let server: Server;
let base = '';
const createdUserIds: string[] = [];

async function listen(): Promise<void> {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

before(async () => {
  await listen();
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

async function json(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  if (text) {
    body = JSON.parse(text) as Record<string, unknown>;
  }
  return { status: response.status, body };
}

async function createSession(): Promise<{ token: string; userId: string }> {
  const { status, body } = await json('/api/auth/session', { method: 'POST' });
  assert.equal(status, 200);
  const token = String(body.token);
  const userId = String(body.userId);
  createdUserIds.push(userId);
  assert.equal(JSON.stringify(body).includes('accessToken'), false);
  assert.equal(JSON.stringify(body).includes('refreshToken'), false);
  return { token, userId };
}

describe('health and AI configuration', () => {
  it('reports API health without authentication', async () => {
    const { status, body } = await json('/api/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'musicmix-backend');
  });

  it('reports AI as unconfigured when credentials are empty', async () => {
    const session = await createSession();
    const { status, body } = await json('/api/ai/status', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(status, 200);
    assert.equal(body.configured, false);
  });

  it('does not generate or invent songs when AI credentials are missing', async () => {
    const session = await createSession();
    const generated = await json('/api/ai/playlists/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ prompt: '90s Telugu hits' }),
    });
    assert.equal(generated.status, 503);
    const error = generated.body.error as Record<string, unknown>;
    assert.equal(error.code, 'AI_UNAVAILABLE');
    assert.equal(JSON.stringify(generated.body).includes('accessToken'), false);
    assert.equal(generated.body.playlist, undefined);
  });
});

describe('HTTP authentication', () => {
  it('rejects missing authentication on protected routes', async () => {
    const { status, body } = await json('/api/playlists');
    assert.equal(status, 401);
    const error = body.error as Record<string, unknown>;
    assert.equal(error.code, 'TOKEN_INVALID');
    assert.equal(JSON.stringify(body).includes('jwt'), false);
  });

  it('rejects a malformed bearer token', async () => {
    const { status } = await json('/api/playlists', {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });
    assert.equal(status, 401);
  });

  it('rejects an expired MusicMix session', async () => {
    const session = await createSession();
    const expired = jwt.sign({ sub: session.userId, exp: Math.floor(Date.now() / 1000) - 30 }, env.JWT_SECRET, {
      algorithm: 'HS256',
    });
    const { status } = await json('/api/playlists', {
      headers: { Authorization: `Bearer ${expired}` },
    });
    assert.equal(status, 401);
  });
});

describe('IDOR protection', () => {
  it('does not let user B read or modify user A playlists', async () => {
    const userA = await createSession();
    const userB = await createSession();
    const created = await json('/api/playlists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ name: 'A private mix' }),
    });
    assert.ok(created.status === 200 || created.status === 201, JSON.stringify(created.body));
    const playlist = created.body.playlist as { id: string };
    assert.ok(playlist.id);

    const stolenGet = await json(`/api/playlists/${playlist.id}`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(stolenGet.status, 404);

    const stolenUpdate = await json(`/api/playlists/${playlist.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userB.token}` },
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    assert.equal(stolenUpdate.status, 404);

    const stolenDelete = await json(`/api/playlists/${playlist.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(stolenDelete.status, 404);

    const owner = await json(`/api/playlists/${playlist.id}`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert.equal(owner.status, 200);
    const owned = owner.body.playlist as { name: string };
    assert.equal(owned.name, 'A private mix');
  });

  it('does not let user B read user A conversions or AI generations', async () => {
    const userA = await createSession();
    const userB = await createSession();
    const conversion = await prisma.playlistConversion.create({
      data: {
        userId: userA.userId,
        sourceProvider: 'SPOTIFY',
        sourcePlaylistId: 'src-1',
        destinationProvider: 'YOUTUBE',
      },
    });
    const generation = await prisma.playlistGeneration.create({
      data: {
        userId: userA.userId,
        requestText: 'Telugu romantic songs',
        parsedIntent: { language: 'Telugu' },
        candidateTracks: [],
      },
    });

    const stolenConversion = await json(`/api/conversions/${conversion.id}`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(stolenConversion.status, 404);

    const stolenGeneration = await json(`/api/ai/playlists/${generation.id}`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(stolenGeneration.status, 404);

    const stolenConfirm = await json(`/api/conversions/${conversion.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userB.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(stolenConfirm.status, 404);

    const stolenCreate = await json(`/api/conversions/${conversion.id}/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userB.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(stolenCreate.status, 404);

    const stolenAiCreate = await json(`/api/ai/playlists/${generation.id}/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userB.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(stolenAiCreate.status, 404);
  });
});

describe('request validation and Amazon disabled state', () => {
  it('rejects an oversized playlist name and injected userId', async () => {
    const session = await createSession();
    const longName = await json('/api/playlists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ name: 'x'.repeat(121) }),
    });
    assert.equal(longName.status, 400);

    const injected = await json('/api/playlists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ name: 'Mine', userId: 'someone-else' }),
    });
    assert.equal(injected.status, 400);
  });

  it('rejects an unknown search provider and empty/oversize queries', async () => {
    const session = await createSession();
    const unknown = await json('/api/search/tidal?q=hello', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(unknown.status, 503, JSON.stringify(unknown.body));

    const empty = await json('/api/search?q=', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(empty.status, 400);

    const tooLong = await json(`/api/search?q=${'a'.repeat(201)}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(tooLong.status, 400);

    const unicode = await json(`/api/search?q=${encodeURIComponent('తెలుగు రొమాంటిక్')}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.notEqual(unicode.status, 500);
    assert.ok(unicode.status === 401 || unicode.status === 404 || unicode.status === 400);
  });

  it('reports Amazon Music as unavailable without fake catalogs', async () => {
    const session = await createSession();
    const { status, body } = await json('/api/providers', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(status, 200);
    const providers = body.providers as Array<Record<string, unknown>>;
    const amazon = providers.find((item) => item.id === 'amazon_music');
    assert.ok(amazon);
    assert.equal(amazon.enabled, false);
    assert.equal(amazon.connected, false);
    assert.match(String(amazon.unavailableReason), /unavailable|Amazon Music/i);
    assert.equal(JSON.stringify(body).includes('accessToken'), false);
    assert.equal(JSON.stringify(body).includes('refreshToken'), false);
  });

  it('does not create a second local playlist for an in-flight duplicate create', async () => {
    const session = await createSession();
    const payload = JSON.stringify({ name: 'Idempotent mix' });
    const [first, second] = await Promise.all([
      json('/api/playlists', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: payload,
      }),
      json('/api/playlists', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: payload,
      }),
    ]);
    assert.ok(first.status === 200 || first.status === 201, JSON.stringify(first.body));
    assert.ok(second.status === 200 || second.status === 201, JSON.stringify(second.body));
    const a = first.body.playlist as { id: string };
    const b = second.body.playlist as { id: string };
    assert.equal(a.id, b.id);
  });
});
