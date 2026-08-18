import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';

const SECRET_DETAIL = /token|secret|password|authorization|cookie|key|refresh|bearer|client_id|client_secret|x-api-key|securityprofile/i;

function publicDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET_DETAIL.test(key)) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

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
        details: publicDetails(err.details),
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
