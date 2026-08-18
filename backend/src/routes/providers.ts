import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getProviders } from '../controllers/providerController';

export const providersRouter = Router();

providersRouter.get('/', requireAuth, getProviders);
