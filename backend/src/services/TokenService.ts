import { MusicAccount, MusicProviderName } from '@prisma/client';
import { prisma } from '../config/prisma';
import { fromPrismaProvider, getProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { isNonRetryableProviderError } from '../providers/youtube/youtubeErrors';
import {
  ConfigurationError,
  isAccessTokenExpiredError,
  SpotifyInvalidTokenError,
  SpotifyReconnectRequiredError,
  SpotifyTokenDecryptError,
  TokenInvalidError,
} from '../types/errors';
import type { MusicProvider, ProviderId, ProviderTokens, ProviderUser } from '../types/provider';
import { logger } from '../utils/logger';
import { isLikelyJwt } from '../utils/crypto';
import { TokenEncryptionService } from './TokenEncryptionService';

export interface StoredAccount {
  id: string;
  provider: ProviderId;
  providerUserId: string;
  displayName?: string;
  imageUrl?: string;
  tokens: ProviderTokens;
  accessTokenDecryptOk: boolean;
  refreshTokenDecryptOk: boolean;
}

function encrypt(value: string): string {
  return TokenEncryptionService.encrypt(value);
}

function tryDecrypt(value: string): { ok: true; value: string } | { ok: false } {
  try {
    return { ok: true, value: TokenEncryptionService.decrypt(value) };
  } catch {
    return { ok: false };
  }
}

export function toPublicAccount(account: {
  provider: MusicProviderName;
  providerUserId: string;
  displayName: string | null;
  imageUrl: string | null;
  expiresAt: Date | null;
}): {
  provider: ProviderId;
  providerUserId: string;
  connected: true;
  displayName: string | null;
  imageUrl: string | null;
  expiresAt: string | null;
} {
  return {
    provider: fromPrismaProvider(account.provider),
    providerUserId: account.providerUserId,
    connected: true,
    displayName: account.displayName,
    imageUrl: account.imageUrl,
    expiresAt: account.expiresAt?.toISOString() ?? null,
  };
}

function persistTokenData(tokens: ProviderTokens) {
  return {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt ?? null,
    scopes: tokens.scopes ?? null,
  };
}

export async function saveMusicAccount(input: {
  userId: string;
  provider: ProviderId;
  user: ProviderUser;
  tokens: ProviderTokens;
}): Promise<MusicAccount> {
  const tokenData = persistTokenData(input.tokens);
  const prismaProvider = toPrismaProvider(input.provider);
  const profile = {
    providerUserId: input.user.id,
    displayName: input.user.displayName,
    imageUrl: input.user.imageUrl ?? null,
    subscriptionTier: input.user.subscriptionTier ?? null,
  };

  return prisma.$transaction(async (tx) => {
    await tx.musicAccount.deleteMany({
      where: {
        provider: prismaProvider,
        providerUserId: input.user.id,
        NOT: { userId: input.userId },
      },
    });
    return tx.musicAccount.upsert({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: prismaProvider,
        },
      },
      create: {
        userId: input.userId,
        provider: prismaProvider,
        ...profile,
        ...tokenData,
      },
      update: {
        ...profile,
        ...tokenData,
      },
    });
  });
}

export async function deleteMusicAccount(userId: string, provider: ProviderId): Promise<void> {
  await prisma.musicAccount.deleteMany({
    where: { userId, provider: toPrismaProvider(provider) },
  });
}

export async function disconnectMusicAccount(userId: string, provider: ProviderId): Promise<void> {
  const account = await getStoredAccount(userId, provider);
  if (account) {
    try {
      await getProvider(provider).logout(account.tokens);
    } catch {
      // Local disconnect still proceeds if Google revoke fails.
    }
  }
  await deleteMusicAccount(userId, provider);
}

export async function getStoredAccount(
  userId: string,
  provider: ProviderId,
): Promise<StoredAccount | null> {
  const account = await prisma.musicAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: toPrismaProvider(provider),
      },
    },
  });
  if (!account) {
    return null;
  }
  const access = tryDecrypt(account.accessToken);
  const refresh = account.refreshToken ? tryDecrypt(account.refreshToken) : { ok: true as const, value: undefined };
  return {
    id: account.id,
    provider,
    providerUserId: account.providerUserId,
    displayName: account.displayName ?? undefined,
    imageUrl: account.imageUrl ?? undefined,
    accessTokenDecryptOk: access.ok,
    refreshTokenDecryptOk: refresh.ok,
    tokens: {
      accessToken: access.ok ? access.value : '',
      refreshToken: refresh.ok ? refresh.value : undefined,
      expiresAt: account.expiresAt ?? undefined,
      scopes: account.scopes ?? undefined,
    },
  };
}

export async function requireStoredAccount(userId: string, provider: ProviderId): Promise<StoredAccount> {
  const account = await getStoredAccount(userId, provider);
  if (!account) {
    throw new TokenInvalidError(`Connect ${getProvider(provider).displayName} before using this feature.`);
  }
  return account;
}

async function persistRefreshedTokens(accountId: string, refreshed: ProviderTokens, previous: ProviderTokens) {
  await prisma.musicAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encrypt(refreshed.accessToken),
      refreshToken: refreshed.refreshToken
        ? encrypt(refreshed.refreshToken)
        : previous.refreshToken
          ? encrypt(previous.refreshToken)
          : null,
      expiresAt: refreshed.expiresAt ?? null,
      scopes: refreshed.scopes ?? null,
    },
  });
}

const REFRESH_SKEW_MS = 60_000;

function reconnectProviderError(displayName: string): TokenInvalidError | SpotifyReconnectRequiredError {
  if (displayName === 'Spotify') {
    return new SpotifyReconnectRequiredError();
  }
  return new TokenInvalidError(
    `Your ${displayName} session could not be refreshed. Please reconnect ${displayName} in Settings.`,
  );
}

/** Refresh when expiry is unknown, token decrypt failed, token looks like a JWT, or within 60s. */
export function needsAccessTokenRefresh(tokens: ProviderTokens): boolean {
  if (!tokens.refreshToken) {
    return false;
  }
  if (!tokens.accessToken || isLikelyJwt(tokens.accessToken)) {
    return true;
  }
  if (!tokens.expiresAt || Number.isNaN(tokens.expiresAt.getTime())) {
    return true;
  }
  return tokens.expiresAt.getTime() <= Date.now() + REFRESH_SKEW_MS;
}

async function refreshAndPersist(
  accountId: string,
  adapter: MusicProvider,
  previous: ProviderTokens,
): Promise<ProviderTokens> {
  if (!previous.refreshToken) {
    throw reconnectProviderError(adapter.displayName);
  }
  try {
    const refreshed = await adapter.refreshAccessToken(previous);
    if (!refreshed.accessToken) {
      throw reconnectProviderError(adapter.displayName);
    }
    await persistRefreshedTokens(accountId, refreshed, previous);
    return refreshed;
  } catch (error) {
    if (
      error instanceof TokenInvalidError ||
      error instanceof SpotifyReconnectRequiredError ||
      error instanceof SpotifyTokenDecryptError ||
      error instanceof ConfigurationError ||
      isNonRetryableProviderError(error)
    ) {
      throw error;
    }
    throw reconnectProviderError(adapter.displayName);
  }
}

function accessTokenLooksExpired(tokens: ProviderTokens, accessTokenDecryptOk: boolean): boolean {
  if (!accessTokenDecryptOk || !tokens.accessToken || isLikelyJwt(tokens.accessToken)) {
    return true;
  }
  if (!tokens.expiresAt || Number.isNaN(tokens.expiresAt.getTime())) {
    return true;
  }
  return tokens.expiresAt.getTime() <= Date.now() + REFRESH_SKEW_MS;
}

function logSpotifySearchAuth(userId: string, account: StoredAccount): void {
  logger.info('spotify search auth', {
    userIdPresent: Boolean(userId),
    spotifyAccountFound: true,
    providerUserIdPresent: Boolean(account.providerUserId),
    accessTokenPresent: account.accessTokenDecryptOk && account.tokens.accessToken.length > 0,
    refreshTokenPresent: account.refreshTokenDecryptOk && Boolean(account.tokens.refreshToken),
    expiresAt: account.tokens.expiresAt?.toISOString() ?? null,
    accessTokenExpired: accessTokenLooksExpired(account.tokens, account.accessTokenDecryptOk),
  });
}

function requireSpotifyRefreshToken(account: StoredAccount): string {
  if (!account.refreshTokenDecryptOk) {
    logger.warn('spotify token refresh', {
      refreshAttempted: true,
      spotifyRefreshStatus: null,
      spotifyRefreshError: 'decrypt_failed',
      spotifyRefreshErrorDescription: 'refresh_token_decrypt_failed',
    });
    throw new SpotifyTokenDecryptError();
  }
  if (!account.tokens.refreshToken) {
    throw new SpotifyReconnectRequiredError();
  }
  return account.tokens.refreshToken;
}

async function refreshSpotifyAccount(account: StoredAccount): Promise<ProviderTokens> {
  const refreshToken = requireSpotifyRefreshToken(account);
  const adapter = getProvider('spotify');
  logger.info('spotify token refresh', { refreshAttempted: true });
  return refreshAndPersist(account.id, adapter, {
    ...account.tokens,
    refreshToken,
  });
}

export async function withSpotifySearchTokens<T>(
  userId: string,
  operation: (tokens: ProviderTokens, attempt: 'initial' | 'retry') => Promise<T>,
): Promise<T> {
  const account = await requireStoredAccount(userId, 'spotify');
  logSpotifySearchAuth(userId, account);
  let tokens = account.tokens;
  let refreshedOnce = false;
  const cannotUseAccess =
    !account.accessTokenDecryptOk || !tokens.accessToken || isLikelyJwt(tokens.accessToken);

  if (cannotUseAccess || needsAccessTokenRefresh(tokens)) {
    tokens = await refreshSpotifyAccount(account);
    refreshedOnce = true;
  }

  try {
    return await operation(tokens, 'initial');
  } catch (error) {
    if (!isAccessTokenExpiredError(error)) {
      throw error;
    }
    if (refreshedOnce) {
      throw new SpotifyInvalidTokenError();
    }
    tokens = await refreshSpotifyAccount(account);
    return operation(tokens, 'retry');
  }
}

export async function withProviderTokens<T>(
  userId: string,
  provider: ProviderId,
  operation: (tokens: ProviderTokens) => Promise<T>,
): Promise<T> {
  const account = await requireStoredAccount(userId, provider);
  const adapter = getProvider(provider);
  let tokens = account.tokens;
  let refreshedOnce = false;

  if (provider === 'spotify') {
    logSpotifySearchAuth(userId, account);
  }

  if (!account.accessTokenDecryptOk || isLikelyJwt(tokens.accessToken) || needsAccessTokenRefresh(tokens)) {
    if (provider === 'spotify' && !account.refreshTokenDecryptOk) {
      logger.warn('spotify token refresh', {
        refreshAttempted: true,
        spotifyRefreshStatus: null,
        spotifyRefreshError: 'decrypt_failed',
        spotifyRefreshErrorDescription: 'refresh_token_decrypt_failed',
      });
      throw new SpotifyTokenDecryptError();
    }
    logger.info('provider token refresh', {
      provider,
      refreshAttempted: true,
      reason: !account.accessTokenDecryptOk ? 'access_decrypt_failed' : 'expired_or_missing',
    });
    try {
      tokens = await refreshAndPersist(account.id, adapter, tokens);
      refreshedOnce = true;
      logger.info('provider token refresh', { provider, attempted: true, success: true });
    } catch (error) {
      logger.warn('provider token refresh', { provider, attempted: true, success: false });
      throw error;
    }
  }

  try {
    return await operation(tokens);
  } catch (error) {
    if (isNonRetryableProviderError(error) || !isAccessTokenExpiredError(error)) {
      throw error;
    }
    if (refreshedOnce || !tokens.refreshToken) {
      if (provider === 'spotify' && !account.refreshTokenDecryptOk) {
        throw new SpotifyTokenDecryptError();
      }
      throw reconnectProviderError(adapter.displayName);
    }
    logger.info('provider token refresh', { provider, attempted: true, reason: 'http_401' });
    try {
      const refreshed = await refreshAndPersist(account.id, adapter, tokens);
      logger.info('provider token refresh', { provider, attempted: true, success: true, reason: 'http_401' });
      return operation(refreshed);
    } catch (error) {
      logger.warn('provider token refresh', { provider, attempted: true, success: false, reason: 'http_401' });
      throw error;
    }
  }
}

export async function listConnectedProviders(userId: string): Promise<MusicProviderName[]> {
  const accounts = await prisma.musicAccount.findMany({
    where: { userId },
    select: { provider: true },
  });
  return accounts.map((account) => account.provider);
}
