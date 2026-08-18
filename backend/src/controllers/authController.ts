import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { parseProviderId, requireEnabledProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { createSession } from '../services/AuthService';
import { deleteMusicAccount, saveMusicAccount } from '../services/TokenService';
import { OAuthFailedError } from '../types/errors';
import { randomUrlToken, toPkceChallenge } from '../utils/crypto';
import { logger } from '../utils/logger';

const providerParam = z.enum(['spotify', 'google']);

function providerFromParam(param: string) {
  const parsed = providerParam.parse(param);
  return parsed === 'google' ? 'youtube' : 'spotify';
}

function oauthRedirect(status: 'success' | 'error', message?: string): string {
  const url = new URL(getEnv().APP_DEEP_LINK);
  url.searchParams.set('status', status);
  if (message) {
    url.searchParams.set('message', message);
  }
  return url.toString();
}

export async function createAnonymousSession(_req: Request, res: Response): Promise<void> {
  const session = await createSession();
  res.cookie('musicmix_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ token: session.token, userId: session.userId });
}

export async function startOAuth(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    throw new OAuthFailedError();
  }
  const providerId = providerFromParam(String(req.params.provider));
  const adapter = requireEnabledProvider(providerId);
  const state = randomUrlToken(24);
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = toPkceChallenge(codeVerifier);

  await prisma.oAuthState.create({
    data: {
      userId,
      provider: toPrismaProvider(providerId),
      state,
      codeVerifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const { authorizationUrl } = adapter.getAuthorizationUrl(state, codeChallenge);
  res.json({ authorizationUrl, provider: providerId });
}

export async function oauthCallback(req: Request, res: Response): Promise<void> {
  const errorParam = typeof req.query.error === 'string' ? req.query.error : undefined;
  if (errorParam) {
    res.redirect(oauthRedirect('error', 'The music service denied access.'));
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  if (!code || !state) {
    res.redirect(oauthRedirect('error', 'Missing authorization code.'));
    return;
  }

  const pending = await prisma.oAuthState.findUnique({ where: { state } });
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    res.redirect(oauthRedirect('error', 'This sign-in link expired. Please try again.'));
    return;
  }

  await prisma.oAuthState.delete({ where: { id: pending.id } });

  try {
    const providerId = parseProviderId(
      pending.provider === 'SPOTIFY' ? 'spotify' : pending.provider === 'YOUTUBE' ? 'youtube' : 'amazon_music',
    );
    const adapter = requireEnabledProvider(providerId);
    const result = await adapter.authenticate(code, pending.codeVerifier ?? undefined);
    await saveMusicAccount({
      userId: pending.userId,
      provider: providerId,
      user: result.user,
      tokens: result,
    });
    res.redirect(oauthRedirect('success', `${adapter.displayName} connected.`));
  } catch (error) {
    logger.warn('OAuth callback failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    res.redirect(oauthRedirect('error', 'Could not connect the music service.'));
  }
}

export async function disconnectProvider(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    throw new OAuthFailedError();
  }
  const providerId = parseProviderId(String(req.params.provider));
  await deleteMusicAccount(userId, providerId);
  res.json({ ok: true, provider: providerId });
}
