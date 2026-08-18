import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  analyze,
  analyzeConversionSchema,
  confirm,
  confirmConversionSchema,
  create,
  createConversionSchema,
  getOne,
} from '../controllers/conversionController';

export const conversionsRouter = Router();

conversionsRouter.post('/analyze', requireAuth, validateBody(analyzeConversionSchema), analyze);
conversionsRouter.get('/:id', requireAuth, getOne);
conversionsRouter.post('/:id/confirm', requireAuth, validateBody(confirmConversionSchema), confirm);
conversionsRouter.post('/:id/create', requireAuth, validateBody(createConversionSchema), create);
