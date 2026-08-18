import { loadEnv } from './config/env';
import { createApp } from './app';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = createApp(env);
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
