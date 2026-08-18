import { getEnv } from '../../config/env';
import {
  AMAZON_MUSIC_DEFAULT_API_BASE,
  credentialsConfigured,
  isAmazonMusicUsable,
  parseEnabledFlag,
  type AmazonRuntimeConfig,
} from './amazonConfig';

export function getAmazonRuntimeConfig(): AmazonRuntimeConfig {
  const env = getEnv();
  const clientId = (env.AMAZON_LWA_CLIENT_ID || env.AMAZON_MUSIC_CLIENT_ID).trim();
  const clientSecret = (env.AMAZON_LWA_CLIENT_SECRET || env.AMAZON_MUSIC_CLIENT_SECRET).trim();
  const redirectUri = env.AMAZON_MUSIC_REDIRECT_URI.trim();
  const securityProfileId = env.AMAZON_MUSIC_SECURITY_PROFILE_ID.trim();
  const apiBaseUrl = (env.AMAZON_MUSIC_API_BASE_URL || AMAZON_MUSIC_DEFAULT_API_BASE).replace(/\/$/, '');
  return {
    featureEnabled: parseEnabledFlag(env.AMAZON_MUSIC_ENABLED),
    clientId,
    clientSecret,
    securityProfileId,
    redirectUri,
    apiBaseUrl,
  };
}

export function amazonIsConfigured(): boolean {
  return credentialsConfigured(getAmazonRuntimeConfig());
}

export function amazonIsEnabled(): boolean {
  return isAmazonMusicUsable(getAmazonRuntimeConfig());
}
