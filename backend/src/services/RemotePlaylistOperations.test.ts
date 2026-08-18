process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RemoteOperationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { cleanupRemoteOperation, runRemotePlaylistCreate } from './RemotePlaylistOperations';

describe('remote playlist compensating transaction', () => {
  it('marks COMPLETE when remote create and local persist succeed', async () => {
    const user = await prisma.user.create({ data: { displayName: 'ops-ok' } });
    try {
      const result = await runRemotePlaylistCreate({
        userId: user.id,
        provider: 'spotify',
        purpose: 'test-success',
        createRemote: async () => ({ providerPlaylistId: 'spotify-pl-1' }),
        persistLocal: async (remoteId) => ({ id: 'local-1', remoteId }),
      });
      assert.equal(result.id, 'local-1');
      const row = await prisma.remotePlaylistOperation.findFirst({ where: { userId: user.id, purpose: 'test-success' } });
      assert.equal(row?.status, RemoteOperationStatus.COMPLETE);
      assert.equal(row?.remotePlaylistId, 'spotify-pl-1');
      assert.equal(row?.localPlaylistId, 'local-1');
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('does not create a remote id when remote create fails', async () => {
    const user = await prisma.user.create({ data: { displayName: 'ops-remote-fail' } });
    try {
      await assert.rejects(() =>
        runRemotePlaylistCreate({
          userId: user.id,
          provider: 'spotify',
          purpose: 'test-remote-fail',
          createRemote: async () => {
            throw new Error('provider down');
          },
          persistLocal: async () => ({ id: 'should-not' }),
        }),
      );
      const row = await prisma.remotePlaylistOperation.findFirst({ where: { userId: user.id, purpose: 'test-remote-fail' } });
      assert.equal(row?.status, RemoteOperationStatus.FAILED);
      assert.equal(row?.remotePlaylistId, null);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('deletes the remote playlist when local persist fails', async () => {
    const user = await prisma.user.create({ data: { displayName: 'ops-rollback' } });
    const deleted: string[] = [];
    try {
      await assert.rejects(() =>
        runRemotePlaylistCreate({
          userId: user.id,
          provider: 'youtube',
          purpose: 'test-rollback',
          createRemote: async () => ({ providerPlaylistId: 'yt-pl-9' }),
          persistLocal: async () => {
            throw new Error('database write failed');
          },
          deleteRemote: async (id) => {
            deleted.push(id);
          },
        }),
      );
      assert.deepEqual(deleted, ['yt-pl-9']);
      const row = await prisma.remotePlaylistOperation.findFirst({ where: { userId: user.id, purpose: 'test-rollback' } });
      assert.equal(row?.status, RemoteOperationStatus.ROLLED_BACK);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('marks REMOTE_CLEANUP_REQUIRED when remote delete fails', async () => {
    const user = await prisma.user.create({ data: { displayName: 'ops-cleanup' } });
    try {
      await assert.rejects(() =>
        runRemotePlaylistCreate({
          userId: user.id,
          provider: 'spotify',
          purpose: 'test-cleanup',
          createRemote: async () => ({ providerPlaylistId: 'sp-orphan' }),
          persistLocal: async () => {
            throw new Error('local fail');
          },
          deleteRemote: async () => {
            throw new Error('cannot unfollow');
          },
        }),
      );
      const row = await prisma.remotePlaylistOperation.findFirst({ where: { userId: user.id, purpose: 'test-cleanup' } });
      assert.equal(row?.status, RemoteOperationStatus.REMOTE_CLEANUP_REQUIRED);
      assert.equal(row?.remotePlaylistId, 'sp-orphan');

      const cleaned = await cleanupRemoteOperation(row!.id, async () => undefined);
      assert.equal(cleaned.status, RemoteOperationStatus.ROLLED_BACK);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('increments retryCount when cleanup delete still fails', async () => {
    const user = await prisma.user.create({ data: { displayName: 'ops-cleanup-fail' } });
    try {
      await assert.rejects(() =>
        runRemotePlaylistCreate({
          userId: user.id,
          provider: 'spotify',
          purpose: 'test-cleanup-fail',
          createRemote: async () => ({ providerPlaylistId: 'sp-stuck' }),
          persistLocal: async () => {
            throw new Error('local fail');
          },
          deleteRemote: async () => {
            throw new Error('cannot unfollow');
          },
        }),
      );
      const row = await prisma.remotePlaylistOperation.findFirst({
        where: { userId: user.id, purpose: 'test-cleanup-fail' },
      });
      assert.equal(row?.status, RemoteOperationStatus.REMOTE_CLEANUP_REQUIRED);
      const still = await cleanupRemoteOperation(row!.id, async () => {
        throw new Error('still cannot delete');
      });
      assert.equal(still.status, RemoteOperationStatus.REMOTE_CLEANUP_REQUIRED);
      assert.equal(still.retryCount, 2);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
