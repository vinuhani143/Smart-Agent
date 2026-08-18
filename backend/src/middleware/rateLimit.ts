import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

export function createJsonRateLimiter(
  limit: number,
  windowMs: number,
  message: string,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message,
      },
    },
  });
}

export const apiRateLimiter = createJsonRateLimiter(
  300,
  15 * 60 * 1000,
  'Too many requests. Please wait a moment and try again.',
);

export const aiGenerateLimiter = createJsonRateLimiter(
  20,
  15 * 60 * 1000,
  'Too many playlist generation requests. Please wait a moment and try again.',
);

export const authRateLimiter = createJsonRateLimiter(
  40,
  15 * 60 * 1000,
  'Too many sign-in attempts. Please wait and try again.',
);
