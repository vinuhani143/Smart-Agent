import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { TokenInvalidError } from '../types/errors';

interface SessionClaims {
  sub: string;
}

export async function createSession(displayName?: string): Promise<{ token: string; userId: string }> {
  const user = await prisma.user.create({
    data: { displayName: displayName ?? 'MusicMix listener' },
  });
  const token = signSession(user.id);
  return { token, userId: user.id };
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionClaims, getEnv().JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '30d',
  });
}

export async function verifySession(token: string): Promise<string> {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as SessionClaims;
    if (!payload.sub) {
      throw new TokenInvalidError('Your MusicMix session is invalid. Please restart the app.');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new TokenInvalidError('Your MusicMix session is no longer valid.');
    }
    return user.id;
  } catch (error) {
    if (error instanceof TokenInvalidError) {
      throw error;
    }
    throw new TokenInvalidError('Your MusicMix session expired. Please restart the app.');
  }
}
