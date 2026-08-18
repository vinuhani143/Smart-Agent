import type { RequestHandler } from 'express';
import { logger } from '../utils/logger';

export const requestLog: RequestHandler = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
    });
  });
  next();
};
