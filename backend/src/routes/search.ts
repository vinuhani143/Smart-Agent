import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { searchAll, searchOne } from '../controllers/searchController';

export const searchRouter = Router();

searchRouter.get('/', requireAuth, searchAll);
searchRouter.get('/:provider', requireAuth, searchOne);
