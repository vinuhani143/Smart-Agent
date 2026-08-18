import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { listProviders } from '../providers/ProviderRegistry';
import { AppError, ErrorCode, NotFoundError, TokenInvalidError } from '../types/errors';
import { signSession } from './AuthService';
import { disconnectMusicAccount } from './TokenService';

const ANONYMOUS_WARNING =
  'This is a device-only MusicMix account. If you uninstall the app, clear app data, or lose the recovery code, your playlists and connected services cannot be restored. MusicMix does not currently offer email or social login.';

function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(`${getEnv().JWT_SECRET}:${code.trim().toUpperCase()}`)
    .digest('hex');
}

export function generateRecoveryCode(): string {
  const raw = randomBytes(10).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

export async function createAnonymousAccount(): Promise<{
  token: string;
  userId: string;
  anonymous: true;
  recoveryCode: string;
  warning: string;
}> {
  const recoveryCode = generateRecoveryCode();
  const user = await prisma.user.create({
    data: {
      displayName: 'MusicMix listener',
      accountKind: 'ANONYMOUS',
      recoveryCodeHash: hashRecoveryCode(recoveryCode),
      recoveryCodeIssuedAt: new Date(),
    },
  });
  return {
    token: signSession(user.id),
    userId: user.id,
    anonymous: true,
    recoveryCode,
    warning: ANONYMOUS_WARNING,
  };
}

export async function recoverAnonymousAccount(recoveryCode: string): Promise<{ token: string; userId: string }> {
  const trimmed = recoveryCode.trim();
  if (!trimmed) {
    throw new TokenInvalidError('That recovery code is not valid.');
  }
  const hash = hashRecoveryCode(trimmed);
  const match = await prisma.user.findUnique({
    where: { recoveryCodeHash: hash },
    select: { id: true, recoveryCodeHash: true },
  });
  if (!match?.recoveryCodeHash) {
    throw new TokenInvalidError('That recovery code is not valid.');
  }
  const stored = Buffer.from(match.recoveryCodeHash);
  const incoming = Buffer.from(hash);
  if (stored.length !== incoming.length || !timingSafeEqual(stored, incoming)) {
    throw new TokenInvalidError('That recovery code is not valid.');
  }
  return { token: signSession(match.id), userId: match.id };
}

export async function getAccountView(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      accountKind: true,
      recoveryCodeIssuedAt: true,
      createdAt: true,
    },
  });
  if (!user) {
    throw new NotFoundError('That MusicMix account was not found.');
  }
  return {
    userId: user.id,
    displayName: user.displayName,
    anonymous: user.accountKind === 'ANONYMOUS',
    recoveryIssued: Boolean(user.recoveryCodeIssuedAt),
    createdAt: user.createdAt,
    warning: ANONYMOUS_WARNING,
    upgradePath:
      'Full account recovery with email or Google/Apple sign-in is not configured. Keep the recovery code from first launch, or wait for an identity provider to be added. Do not invent a login provider.',
  };
}

export async function deleteAccount(userId: string): Promise<{
  deleted: true;
  providerDisconnect: Array<{ provider: string; revoked: boolean; message: string }>;
}> {
  const providerDisconnect: Array<{ provider: string; revoked: boolean; message: string }> = [];
  for (const provider of listProviders()) {
    try {
      await disconnectMusicAccount(userId, provider.id);
      providerDisconnect.push({
        provider: provider.id,
        revoked: true,
        message: `${provider.displayName} was disconnected. Playlists that already exist on that service are not deleted automatically.`,
      });
    } catch {
      providerDisconnect.push({
        provider: provider.id,
        revoked: false,
        message: `Could not confirm ${provider.displayName} token revocation. MusicMix still deletes local tokens and account data.`,
      });
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  return { deleted: true, providerDisconnect };
}

export function requireCleanupKey(provided: string | undefined): void {
  const expected = getEnv().INTERNAL_CLEANUP_KEY.trim();
  if (!expected) {
    throw new AppError(
      ErrorCode.CONFIGURATION_ERROR,
      'Remote playlist cleanup is not configured on this server.',
      503,
    );
  }
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Not authorized.', 403);
  }
}
