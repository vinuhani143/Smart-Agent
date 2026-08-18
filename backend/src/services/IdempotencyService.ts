import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { AppError, ErrorCode } from '../types/errors';
import { oncePerKey } from '../utils/inFlight';

const KEY_MAX = 128;
const PENDING_STATUS = 0;

export function readIdempotencyKey(req: Request): string | undefined {
  const header = req.header('idempotency-key') ?? req.header('Idempotency-Key');
  const value = header?.trim();
  if (!value) {
    return undefined;
  }
  return value.slice(0, KEY_MAX);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCompletion(
  userId: string,
  key: string,
): Promise<{ status: number; body: unknown }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const row = await prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (row && row.statusCode > PENDING_STATUS) {
      return { status: row.statusCode, body: row.responseJson };
    }
    if (!row) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Retry this request. The previous attempt did not finish.',
        409,
      );
    }
    await sleep(50);
  }
  throw new AppError(ErrorCode.CONFLICT, 'A request with this key is still in progress.', 409);
}

/**
 * Claim the idempotency key before executing side effects so concurrent
 * retries cannot create duplicate remote playlists.
 */
export async function withIdempotency(
  req: Request,
  res: Response,
  userId: string,
  execute: () => Promise<{ status: number; body: unknown }>,
): Promise<void> {
  const key = readIdempotencyKey(req);
  const method = req.method.toUpperCase();
  const path = req.originalUrl.split('?')[0] ?? req.path;

  if (!key) {
    const result = await execute();
    res.status(result.status).json(result.body);
    return;
  }

  const result = await oncePerKey(`idem:${userId}:${key}`, async () => {
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (existing && existing.statusCode > PENDING_STATUS) {
      return { status: existing.statusCode, body: existing.responseJson };
    }
    if (existing && existing.statusCode === PENDING_STATUS) {
      return waitForCompletion(userId, key);
    }

    try {
      await prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          method,
          path,
          statusCode: PENDING_STATUS,
          responseJson: { status: 'pending' },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return waitForCompletion(userId, key);
      }
      throw error;
    }

    try {
      const executed = await execute();
      await prisma.idempotencyRecord.update({
        where: { userId_key: { userId, key } },
        data: {
          statusCode: executed.status,
          responseJson: executed.body as Prisma.InputJsonValue,
        },
      });
      return executed;
    } catch (error) {
      await prisma.idempotencyRecord
        .delete({ where: { userId_key: { userId, key } } })
        .catch(() => undefined);
      throw error;
    }
  });

  res.status(result.status).json(result.body);
}
