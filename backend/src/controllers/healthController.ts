import { prisma } from '../config/prisma';
import { corsOriginList, getEnv } from '../config/env';
import { publicProviderConfiguration } from '../services/providerStatus';

function describeProductionApiUrl(): string {
  const env = getEnv();
  const url = env.API_PUBLIC_URL;
  const loopback = /localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2/i.test(url);
  if (/YOUR_PRODUCTION_BACKEND_DOMAIN/i.test(url)) {
    return 'placeholder_not_replaced';
  }
  if (env.NODE_ENV === 'production') {
    if (loopback) {
      return 'invalid_loopback';
    }
    if (!url.startsWith('https://')) {
      return 'invalid_not_https';
    }
    return 'https_configured';
  }
  return loopback ? 'development_loopback' : 'non_production_origin';
}

export async function health(_req: unknown, res: { json: (body: unknown) => void }): Promise<void> {
  let database: 'up' | 'down' = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch {
    database = 'down';
  }
  const providers = publicProviderConfiguration();
  res.json({
    ok: database === 'up',
    service: 'musicmix-backend',
    database,
    application: 'up',
    providers: {
      spotify: providers.spotify,
      youtube: providers.youtube,
      amazonMusic: providers.amazonMusic,
      ai: providers.ai,
    },
  });
}

export async function releaseReadiness(_req: unknown, res: { json: (body: unknown) => void }): Promise<void> {
  let database: 'up' | 'down' = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch {
    database = 'down';
  }
  const providers = publicProviderConfiguration();
  res.json({
    codeQuality: 'fixes_present_not_production_certified',
    database,
    spotifyOAuth: providers.spotify === 'configured' ? 'configured_unverified' : 'not_configured',
    youtubeOAuth: providers.youtube === 'configured' ? 'configured_unverified' : 'not_configured',
    amazonMusic: providers.amazonMusic,
    ai: providers.ai === 'configured' ? 'configured_unverified' : 'unavailable',
    productionApiUrl: describeProductionApiUrl(),
    cors: corsOriginList(getEnv()).includes('*') ? 'wildcard_forbidden' : 'restrictive',
    androidBuildConfig: 'placeholders_present_not_signed',
  });
}
