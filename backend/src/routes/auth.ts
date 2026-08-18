import { Router } from 'express';
import { authRateLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';
import {
  createAnonymousSession,
  disconnectProvider,
  oauthCallback,
  startOAuth,
} from '../controllers/authController';

export const authRouter = Router();

authRouter.post('/session', authRateLimiter, createAnonymousSession);
authRouter.post('/:provider/start', authRateLimiter, requireAuth, startOAuth);
authRouter.get('/:provider/callback', oauthCallback);
authRouter.post('/:provider/disconnect', requireAuth, disconnectProvider);
