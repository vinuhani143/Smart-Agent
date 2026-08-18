import { MusicAccount, MusicProviderName } from '@prisma/client';
import { getEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { fromPrismaProvider, getProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { TokenExpiredError, TokenInvalidError } from '../types/errors';
import type { ProviderId, ProviderTokens, ProviderUser } from '../types/provider';
import { decryptSecret, encryptSecret } from '../utils/crypto';

export interface StoredAccount {
  id: string;
  provider: ProviderId;
  providerUserId: string;
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
  expiresAt: string | null;
} {
  return {
    provider: fromPrismaProvider(account.provider),
    providerUserId: account.providerUserId,
    connected: true,
    expiresAt: account.expiresAt?.toISOString() ?? null,
  };
}

export async function saveMusicAccount(input: {
  userId: string;
  provider: ProviderId;
  user: ProviderUser;
  tokens: ProviderTokens;
}): Promise<MusicAccount> {
  const data = {
    providerUserId: input.user.id,
    accessToken: encrypt(input.tokens.accessToken),
    refreshToken: input.tokens.refreshToken ? encrypt(input.tokens.refreshToken) : null,
    expiresAt: input.tokens.expiresAt ?? null,
    scopes: input.tokens.scopes ?? null,
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
      ...data,
    },
    update: data,
  });
}

export async function deleteMusicAccount(userId: string, provider: ProviderId): Promise<void> {
  await prisma.musicAccount.deleteMany({
    where: { userId, provider: toPrismaProvider(provider) },
  });
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

export async function withProviderTokens<T>(
  userId: string,
  provider: ProviderId,
  operation: (tokens: ProviderTokens) => Promise<T>,
): Promise<T> {
  const account = await requireStoredAccount(userId, provider);
  const adapter = getProvider(provider);
  try {
    return await operation(account.tokens);
  } catch (error) {
    if (!(error instanceof TokenExpiredError)) {
      throw error;
    }
    const refreshed = await adapter.refreshAccessToken(account.tokens);
    await prisma.musicAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encrypt(refreshed.accessToken),
        refreshToken: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : account.tokens.refreshToken
          ? encrypt(account.tokens.refreshToken)
          : null,
        expiresAt: refreshed.expiresAt ?? null,
        scopes: refreshed.scopes ?? null,
      },
    });
    return operation(refreshed);
  }
}

export async function listConnectedProviders(userId: string): Promise<MusicProviderName[]> {
  const accounts = await prisma.musicAccount.findMany({
    where: { userId },
    select: { provider: true },
  });
  return accounts.map((account) => account.provider);
}
