import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { searchAll, searchOne } from '../controllers/searchController';
import { searchQuerySchema } from '../validation/schemas';

export const searchRouter = Router();

searchRouter.get('/', requireAuth, validateQuery(searchQuerySchema), searchAll);
searchRouter.get('/:provider', requireAuth, validateQuery(searchQuerySchema), searchOne);
