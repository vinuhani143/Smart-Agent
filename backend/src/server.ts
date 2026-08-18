import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOriginList, loadEnv } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { requestLog } from './middleware/requestLog';
import { apiRouter } from './routes';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = express();

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: corsOriginList(env),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(requestLog);
  app.use(apiRateLimiter);
  app.use('/api', apiRouter);
  app.use(errorHandler);

  app.listen(env.PORT, () => {
    logger.info(`MusicMix API listening on ${env.API_PUBLIC_URL} (port ${env.PORT})`);
  });
}

main().catch((error: unknown) => {
  logger.error('Failed to start MusicMix API', {
    message: error instanceof Error ? error.message : 'unknown',
  });
  process.exit(1);
});
