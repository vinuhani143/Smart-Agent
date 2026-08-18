import type { Express } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      requestId?: string;
    }
  }
}

export type AppInstance = Express;
