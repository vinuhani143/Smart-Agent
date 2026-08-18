process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { prisma } from '../config/prisma';
import { createAnonymousAccount, deleteAccount, recoverAnonymousAccount } from './AccountService';
import { TokenInvalidError } from '../types/errors';

describe('anonymous account recovery and deletion', () => {
  const userIds: string[] = [];

  after(async () => {
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it('recovers the same user and isolates a different recovery code', async () => {
    const first = await createAnonymousAccount();
    const second = await createAnonymousAccount();
    userIds.push(first.userId, second.userId);
    const recovered = await recoverAnonymousAccount(first.recoveryCode);
    assert.equal(recovered.userId, first.userId);
    assert.notEqual(recovered.userId, second.userId);
    await assert.rejects(() => recoverAnonymousAccount('ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ'), TokenInvalidError);
    await assert.rejects(() => recoverAnonymousAccount(''), TokenInvalidError);
  });

  it('deleteAccount removes the user and stored provider tokens', async () => {
    const session = await createAnonymousAccount();
    userIds.push(session.userId);
    const result = await deleteAccount(session.userId);
    assert.equal(result.deleted, true);
    const leftover = await prisma.user.findUnique({ where: { id: session.userId } });
    assert.equal(leftover, null);
    const tokens = await prisma.musicAccount.findMany({ where: { userId: session.userId } });
    assert.equal(tokens.length, 0);
  });
});
