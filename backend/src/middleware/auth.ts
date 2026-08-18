import type { RequestHandler } from 'express';
import { TokenInvalidError } from '../types/errors';
import { verifySession } from '../services/AuthService';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const cookieToken = req.cookies?.musicmix_session as string | undefined;
    const token = bearer ?? cookieToken;
    if (!token) {
      throw new TokenInvalidError('Sign in to MusicMix first.');
    }
    req.userId = await verifySession(token);
    next();
  } catch (error) {
    next(error);
  }
};
