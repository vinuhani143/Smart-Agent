import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError, ErrorCode } from '../types/errors';

function fail(next: Parameters<RequestHandler>[2], issues: { path: string; message: string }[]): void {
  next(
    new AppError(ErrorCode.VALIDATION_ERROR, 'Some fields are invalid. Please review and try again.', 400, {
      issues,
    }),
  );
}

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      fail(
        next,
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      fail(
        next,
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      return;
    }
    // Express 5 exposes req.query as a getter; assigning it throws TypeError.
    next();
  };
}
