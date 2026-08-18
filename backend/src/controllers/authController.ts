import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { getEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { parseProviderId, requireEnabledProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { createAnonymousAccount, deleteAccount, getAccountView, recoverAnonymousAccount, requireCleanupKey } from '../services/AccountService';
import { cleanupRemoteOperation, serializeRemoteOperation } from '../services/RemotePlaylistOperations';
import { TokenEncryptionService } from '../services/TokenEncryptionService';
import { disconnectMusicAccount, saveMusicAccount } from '../services/TokenService';
import { OAuthCancelledError, OAuthFailedError } from '../types/errors';
import type { ProviderId } from '../types/provider';
import { randomUrlToken, toPkceChallenge } from '../utils/crypto';
import { logger } from '../utils/logger';

export function resolveOAuthProvider(param: string): ProviderId {
  const value = param.toLowerCase();
  if (value === 'google' || value === 'youtube') {
    return 'youtube';
  }
  if (value === 'spotify') {
    return 'spotify';
  }
  if (value === 'amazon' || value === 'amazon_music') {
    return 'amazon_music';
  }
  return parseProviderId(value);
}

function oauthRedirect(status: 'success' | 'error' | 'cancelled', message?: string): string {
  const url = new URL(getEnv().APP_DEEP_LINK);
  url.searchParams.set('status', status);
  if (message) {
    url.searchParams.set('message', message);
  }
  return url.toString();
}

export async function createAnonymousSession(_req: Request, res: Response): Promise<void> {
  const session = await createAnonymousAccount();
  res.cookie('musicmix_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({
    token: session.token,
    userId: session.userId,
    anonymous: true,
    recoveryCode: session.recoveryCode,
    warning: session.warning,
  });
}

export async function startOAuth(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    throw new OAuthFailedError();
  }
  const providerId = resolveOAuthProvider(String(req.params.provider));
  const adapter = requireEnabledProvider(providerId);
  const state = randomUrlToken(24);
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = toPkceChallenge(codeVerifier);

  await prisma.oAuthState.create({
    data: {
      userId,
      provider: toPrismaProvider(providerId),
      state,
      codeVerifier: TokenEncryptionService.encrypt(codeVerifier),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const { authorizationUrl } = adapter.getAuthorizationUrl(state, codeChallenge);
  res.json({ authorizationUrl, provider: providerId });
}

function oauthProviderLabel(providerId: ProviderId): string {
  if (providerId === 'youtube') {
    return 'YouTube';
  }
  if (providerId === 'spotify') {
    return 'Spotify';
  }
  if (providerId === 'amazon_music') {
    return 'Amazon Music';
  }
  return 'this music service';
}

export async function oauthCallback(req: Request, res: Response): Promise<void> {
  const requestedProvider = resolveOAuthProvider(String(req.params.provider));
  const label = oauthProviderLabel(requestedProvider);
  const errorParam = typeof req.query.error === 'string' ? req.query.error : undefined;
  if (errorParam === 'access_denied') {
    res.redirect(oauthRedirect('cancelled', `${label} connection was cancelled.`));
    return;
  }
  if (errorParam) {
    res.redirect(
      oauthRedirect(
        'error',
        requestedProvider === 'youtube'
          ? 'Google could not complete YouTube sign-in. Please try again.'
          : `${label} could not complete sign-in. Please try again.`,
      ),
    );
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

  const pendingProvider = parseProviderId(
    pending.provider === 'SPOTIFY' ? 'spotify' : pending.provider === 'YOUTUBE' ? 'youtube' : 'amazon_music',
  );
  if (pendingProvider !== requestedProvider) {
    await prisma.oAuthState.delete({ where: { id: pending.id } });
    res.redirect(oauthRedirect('error', 'This sign-in link is invalid. Please try again.'));
    return;
  }

  await prisma.oAuthState.delete({ where: { id: pending.id } });

  try {
    const adapter = requireEnabledProvider(pendingProvider);
    const codeVerifier = pending.codeVerifier
      ? TokenEncryptionService.decryptOrPlain(pending.codeVerifier)
      : undefined;
    const result = await adapter.authenticate(code, codeVerifier);
    await saveMusicAccount({
      userId: pending.userId,
      provider: pendingProvider,
      user: result.user,
      tokens: result,
    });
    res.redirect(oauthRedirect('success', `${adapter.displayName} connected.`));
  } catch (error) {
    logger.warn('OAuth callback failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    const message =
      error instanceof OAuthCancelledError
        ? error.message
        : requestedProvider === 'youtube'
          ? 'Could not connect YouTube. Check Google OAuth credentials and try again.'
          : `Could not connect ${label}. Check the provider credentials and try again.`;
    res.redirect(oauthRedirect('error', message));
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const view = await getAccountView(req.userId!);
  res.json(view);
}

export async function recoverSession(req: Request, res: Response): Promise<void> {
  const code = typeof req.body?.recoveryCode === 'string' ? req.body.recoveryCode : '';
  const session = await recoverAnonymousAccount(code);
  res.cookie('musicmix_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ token: session.token, userId: session.userId, anonymous: true });
}

export async function deleteCurrentAccount(req: Request, res: Response): Promise<void> {
  const result = await deleteAccount(req.userId!);
  res.clearCookie('musicmix_session', { path: '/' });
  res.json(result);
}

export async function cleanupRemotePlaylistOperation(req: Request, res: Response): Promise<void> {
  requireCleanupKey(req.header('x-musicmix-cleanup-key') ?? undefined);
  const operation = await cleanupRemoteOperation(String(req.params.id));
  res.json({ operation: serializeRemoteOperation(operation) });
}

export async function disconnectProvider(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    throw new OAuthFailedError();
  }
  const providerId = resolveOAuthProvider(String(req.params.provider));
  await disconnectMusicAccount(userId, providerId);
  res.json({ ok: true, provider: providerId });
}
