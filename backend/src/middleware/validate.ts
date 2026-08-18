import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError, ErrorCode } from '../types/errors';

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new AppError(ErrorCode.VALIDATION_ERROR, 'Some fields are invalid. Please review and try again.', 400, {
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
