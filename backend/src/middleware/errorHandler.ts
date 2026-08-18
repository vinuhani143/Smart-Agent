import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { getEnv } from '../config/env';
import { AppError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';

const SECRET_DETAIL = /token|secret|password|authorization|cookie|key|refresh|bearer|client_id|client_secret|x-api-key|securityprofile|code_verifier|authorization_code/i;

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

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Some fields are invalid. Please review and try again.',
        requestId,
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
        requestId,
      },
    });
    return;
  }

  logger.error('Unhandled error', {
    requestId,
    name: err instanceof Error ? err.name : 'unknown',
    message: err instanceof Error ? err.message : 'unknown',
  });

  let debugEnabled = false;
  try {
    const env = getEnv();
    debugEnabled = env.NODE_ENV !== 'production' && env.DEBUG_ERRORS === 'true';
  } catch {
    debugEnabled = false;
  }

  res.status(500).json({
    error: {
      code: ErrorCode.NETWORK_ERROR,
      message: 'Something went wrong. Please try again.',
      requestId,
      ...(debugEnabled && err instanceof Error ? { debug: err.name } : {}),
    },
  });
};
