import { RemoteOperationStatus, type RemotePlaylistOperation } from '@prisma/client';
import { prisma } from '../config/prisma';
import { fromPrismaProvider, getProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { AppError, ErrorCode, NotFoundError } from '../types/errors';
import type { ProviderId } from '../types/provider';
import { withProviderTokens } from './TokenService';

const MAX_CLEANUP_ATTEMPTS = 5;

export interface RemoteCreateHooks<T> {
  userId: string;
  provider: ProviderId;
  purpose: string;
  createRemote: () => Promise<{ providerPlaylistId: string }>;
  persistLocal: (remotePlaylistId: string) => Promise<T>;
  deleteRemote?: (remotePlaylistId: string) => Promise<void>;
}

async function defaultDeleteRemote(userId: string, provider: ProviderId, remotePlaylistId: string): Promise<void> {
  const adapter = getProvider(provider);
  await withProviderTokens(userId, provider, (tokens) => adapter.deletePlaylist(tokens, remotePlaylistId));
}

/**
 * Create a provider playlist, persist locally, and compensate if local persist fails.
 * This is not a distributed ACID transaction.
 */
export async function runRemotePlaylistCreate<T>(hooks: RemoteCreateHooks<T>): Promise<T> {
  const operation = await prisma.remotePlaylistOperation.create({
    data: {
      userId: hooks.userId,
      provider: toPrismaProvider(hooks.provider),
      purpose: hooks.purpose,
      status: RemoteOperationStatus.PENDING,
    },
  });

  let remotePlaylistId: string | undefined;
  try {
    const remote = await hooks.createRemote();
    remotePlaylistId = remote.providerPlaylistId;
    await prisma.remotePlaylistOperation.update({
      where: { id: operation.id },
      data: {
        remotePlaylistId,
        status: RemoteOperationStatus.REMOTE_CREATED,
      },
    });

    const persisted = await hooks.persistLocal(remotePlaylistId);
    const localPlaylistId =
      persisted && typeof persisted === 'object' && 'id' in persisted && typeof persisted.id === 'string'
        ? persisted.id
        : undefined;
    await prisma.remotePlaylistOperation.update({
      where: { id: operation.id },
      data: {
        status: RemoteOperationStatus.COMPLETE,
        localPlaylistId,
      },
    });
    return persisted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Remote playlist operation failed.';
    if (!remotePlaylistId) {
      await prisma.remotePlaylistOperation.update({
        where: { id: operation.id },
        data: { status: RemoteOperationStatus.FAILED, errorMessage: message },
      });
      throw error;
    }

    const deleteRemote = hooks.deleteRemote ?? ((id: string) => defaultDeleteRemote(hooks.userId, hooks.provider, id));
    try {
      await deleteRemote(remotePlaylistId);
      await prisma.remotePlaylistOperation.update({
        where: { id: operation.id },
        data: {
          status: RemoteOperationStatus.ROLLED_BACK,
          errorMessage: message,
          remotePlaylistId,
        },
      });
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'Remote cleanup failed.';
      await prisma.remotePlaylistOperation.update({
        where: { id: operation.id },
        data: {
          status: RemoteOperationStatus.REMOTE_CLEANUP_REQUIRED,
          errorMessage: `${message} Cleanup: ${cleanupMessage}`,
          remotePlaylistId,
          retryCount: 1,
        },
      });
    }
    throw error;
  }
}

export async function cleanupRemoteOperation(
  operationId: string,
  deleteRemote: (userId: string, provider: ProviderId, remotePlaylistId: string) => Promise<void> = defaultDeleteRemote,
): Promise<RemotePlaylistOperation> {
  const operation = await prisma.remotePlaylistOperation.findUnique({ where: { id: operationId } });
  if (!operation) {
    throw new NotFoundError('That remote operation was not found.');
  }
  if (operation.status !== RemoteOperationStatus.REMOTE_CLEANUP_REQUIRED) {
    throw new AppError(ErrorCode.CONFLICT, 'Only operations marked REMOTE_CLEANUP_REQUIRED can be cleaned up.', 409);
  }
  if (operation.retryCount >= MAX_CLEANUP_ATTEMPTS) {
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      'Automatic cleanup stopped after too many attempts. Delete the provider playlist manually, then mark the record complete.',
      429,
    );
  }
  if (!operation.remotePlaylistId) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'No remote playlist id is stored for cleanup.', 400);
  }

  const provider = fromPrismaProvider(operation.provider);
  try {
    await deleteRemote(operation.userId, provider, operation.remotePlaylistId);
    return prisma.remotePlaylistOperation.update({
      where: { id: operation.id },
      data: {
        status: RemoteOperationStatus.ROLLED_BACK,
        retryCount: { increment: 1 },
        errorMessage: operation.errorMessage,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Remote cleanup failed.';
    return prisma.remotePlaylistOperation.update({
      where: { id: operation.id },
      data: {
        retryCount: { increment: 1 },
        errorMessage: message,
      },
    });
  }
}

export function serializeRemoteOperation(operation: RemotePlaylistOperation): Record<string, unknown> {
  return {
    id: operation.id,
    provider: fromPrismaProvider(operation.provider),
    purpose: operation.purpose,
    status: operation.status,
    remotePlaylistId: operation.remotePlaylistId,
    localPlaylistId: operation.localPlaylistId,
    retryCount: operation.retryCount,
    error: operation.errorMessage,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  };
}
