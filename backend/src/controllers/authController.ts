import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { getEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { parseProviderId, requireEnabledProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { createAnonymousAccount, deleteAccount, getAccountView, recoverAnonymousAccount, requireCleanupKey } from '../services/AccountService';
import { cleanupRemoteOperation, serializeRemoteOperation } from '../services/RemotePlaylistOperations';
import { TokenEncryptionService } from '../services/TokenEncryptionService';
import { disconnectMusicAccount, saveMusicAccount } from '../services/TokenService';
import { AppError, OAuthCancelledError, OAuthFailedError } from '../types/errors';
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

function redirectUriFor(providerId: ProviderId): string {
  const env = getEnv();
  if (providerId === 'spotify') {
    return env.SPOTIFY_REDIRECT_URI;
  }
  if (providerId === 'youtube') {
    return env.GOOGLE_REDIRECT_URI;
  }
  return env.AMAZON_MUSIC_REDIRECT_URI;
}

function envRedirectPath(providerId: ProviderId): string | null {
  const raw = redirectUriFor(providerId).trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).pathname;
  } catch {
    return null;
  }
}

function envRedirectIsHttps(providerId: ProviderId): boolean {
  return redirectUriFor(providerId).startsWith('https://');
}

function oauthCallbackUserMessage(providerId: ProviderId, label: string, error: unknown): string {
  if (error instanceof OAuthCancelledError) {
    return error.message;
  }
  if (error instanceof AppError && error.expose) {
    return error.message;
  }
  if (providerId === 'youtube') {
    return 'Could not connect YouTube. Check Google OAuth credentials and try again.';
  }
  return `Could not connect ${label}. Confirm the redirect URI in the provider dashboard matches the server, then try again.`;
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
  logger.info('oauth start', {
    provider: providerId,
    configured: adapter.isEnabled(),
    hasPkce: true,
    redirectHttps: envRedirectIsHttps(providerId),
    redirectPath: envRedirectPath(providerId),
  });
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

  logger.info('oauth callback reached', {
    provider: requestedProvider,
    hasCode: Boolean(code),
    hasState: Boolean(state),
  });

  const pending = await prisma.oAuthState.findUnique({ where: { state } });
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    logger.warn('oauth callback missing state', { provider: requestedProvider, stateFound: false });
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
    logger.info('oauth token exchange', {
      provider: pendingProvider,
      success: true,
      hasRefreshToken: Boolean(result.refreshToken),
    });
    await saveMusicAccount({
      userId: pending.userId,
      provider: pendingProvider,
      user: result.user,
      tokens: result,
    });
    logger.info('oauth token stored', { provider: pendingProvider, stored: true });
    res.redirect(oauthRedirect('success', `${adapter.displayName} connected.`));
  } catch (error) {
    logger.warn('oauth callback failed', {
      provider: requestedProvider,
      name: error instanceof Error ? error.name : 'unknown',
      code: error instanceof AppError ? error.code : undefined,
      tokenStored: false,
    });
    res.redirect(oauthRedirect('error', oauthCallbackUserMessage(requestedProvider, label, error)));
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
