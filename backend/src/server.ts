import { loadEnv } from './config/env';
import { createApp } from './app';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = createApp(env);
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`MusicMix API listening on ${env.HOST}:${env.PORT} (${env.API_PUBLIC_URL})`);
  });
  server.on('error', (error: unknown) => {
    logger.error('MusicMix API listen failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  logger.error('Failed to start MusicMix API', {
    message: error instanceof Error ? error.message : 'unknown',
  });
  process.exit(1);
});
