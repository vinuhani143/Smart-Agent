import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Some fields are invalid. Please review and try again.',
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  logger.error('Unhandled error', {
    name: err instanceof Error ? err.name : 'unknown',
    message: err instanceof Error ? err.message : 'unknown',
  });

  res.status(500).json({
    error: {
      code: ErrorCode.NETWORK_ERROR,
      message: 'Something went wrong. Please try again.',
    },
  });
};
