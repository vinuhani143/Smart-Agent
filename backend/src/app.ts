import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { corsOriginList, type Env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { requestLog } from './middleware/requestLog';
import { apiRouter } from './routes';

const JSON_LIMIT = '1mb';

export function createApp(env: Env): Express {
  const app = express();
  const production = env.NODE_ENV === 'production';

  if (production) {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts: production ? { maxAge: 15552000, includeSubDomains: true } : false,
    }),
  );
  app.use(
    cors({
      origin: corsOriginList(env),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: JSON_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: JSON_LIMIT }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(requestLog);
  app.use(apiRateLimiter);
  app.use('/api', apiRouter);
  app.use(errorHandler);
  return app;
}
