import { MusicAccount, MusicProviderName } from '@prisma/client';
import { getEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { fromPrismaProvider, getProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { isNonRetryableProviderError } from '../providers/youtube/youtubeErrors';
import { TokenExpiredError, TokenInvalidError } from '../types/errors';
import type { ProviderId, ProviderTokens, ProviderUser } from '../types/provider';
import { decryptSecret, encryptSecret } from '../utils/crypto';

export interface StoredAccount {
  id: string;
  provider: ProviderId;
  providerUserId: string;
  displayName?: string;
  imageUrl?: string;
  tokens: ProviderTokens;
}

function encrypt(value: string): string {
  return encryptSecret(value, getEnv().TOKEN_ENCRYPTION_KEY);
}

function decrypt(value: string): string {
  return decryptSecret(value, getEnv().TOKEN_ENCRYPTION_KEY);
}

export function toPublicAccount(account: MusicAccount): {
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
  const profile = {
    providerUserId: input.user.id,
    displayName: input.user.displayName,
    imageUrl: input.user.imageUrl ?? null,
    subscriptionTier: input.user.subscriptionTier ?? null,
  };

  return prisma.musicAccount.upsert({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: toPrismaProvider(input.provider),
      },
    },
    create: {
      userId: input.userId,
      provider: toPrismaProvider(input.provider),
      ...profile,
      ...tokenData,
    },
    update: {
      ...profile,
      ...tokenData,
    },
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
  return {
    id: account.id,
    provider,
    providerUserId: account.providerUserId,
    displayName: account.displayName ?? undefined,
    imageUrl: account.imageUrl ?? undefined,
    tokens: {
      accessToken: decrypt(account.accessToken),
      refreshToken: account.refreshToken ? decrypt(account.refreshToken) : undefined,
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

function isExpiringSoon(tokens: ProviderTokens): boolean {
  if (!tokens.expiresAt) {
    return false;
  }
  return tokens.expiresAt.getTime() <= Date.now() + 60_000;
}

export async function withProviderTokens<T>(
  userId: string,
  provider: ProviderId,
  operation: (tokens: ProviderTokens) => Promise<T>,
): Promise<T> {
  const account = await requireStoredAccount(userId, provider);
  const adapter = getProvider(provider);
  let tokens = account.tokens;

  if (isExpiringSoon(tokens) && tokens.refreshToken) {
    try {
      const refreshed = await adapter.refreshAccessToken(tokens);
      await persistRefreshedTokens(account.id, refreshed, tokens);
      tokens = refreshed;
    } catch (error) {
      if (isNonRetryableProviderError(error)) {
        throw error;
      }
      throw new TokenInvalidError(
        `Your ${adapter.displayName} session could not be refreshed. Please reconnect.`,
      );
    }
  }

  try {
    return await operation(tokens);
  } catch (error) {
    if (isNonRetryableProviderError(error) || !(error instanceof TokenExpiredError)) {
      throw error;
    }
    try {
      const refreshed = await adapter.refreshAccessToken(tokens);
      await persistRefreshedTokens(account.id, refreshed, tokens);
      return operation(refreshed);
    } catch (refreshError) {
      if (isNonRetryableProviderError(refreshError)) {
        throw refreshError;
      }
      throw new TokenInvalidError(
        `Your ${adapter.displayName} session expired and could not be refreshed. Please reconnect.`,
      );
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
