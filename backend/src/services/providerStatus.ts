import { describeAiConfig } from '../ai/configurableLlmProvider';
import { getEnv } from '../config/env';
import { credentialsConfigured, isAmazonMusicUsable, parseEnabledFlag, resolveAmazonAccessStatus } from '../providers/amazon/amazonConfig';
import { getAmazonRuntimeConfig } from '../providers/amazon/amazonRuntime';

export type ConfigFlag = 'configured' | 'not_configured';

export function spotifyConfigStatus(): ConfigFlag {
  const env = getEnv();
  return env.SPOTIFY_CLIENT_ID.trim() && env.SPOTIFY_CLIENT_SECRET.trim() && env.SPOTIFY_REDIRECT_URI.trim()
    ? 'configured'
    : 'not_configured';
}

export function youtubeConfigStatus(): ConfigFlag {
  const env = getEnv();
  return env.GOOGLE_CLIENT_ID.trim() && env.GOOGLE_CLIENT_SECRET.trim() && env.GOOGLE_REDIRECT_URI.trim()
    ? 'configured'
    : 'not_configured';
}

export function amazonConfigStatus(): 'disabled' | 'closed_beta' | 'not_configured' | 'configured' {
  const amazon = getAmazonRuntimeConfig();
  if (isAmazonMusicUsable(amazon)) {
    return 'configured';
  }
  const status = resolveAmazonAccessStatus({
    featureEnabled: parseEnabledFlag(getEnv().AMAZON_MUSIC_ENABLED),
    credentialsConfigured: credentialsConfigured(amazon),
    authenticated: false,
  });
  if (status === 'configured') {
    return 'not_configured';
  }
  if (status === 'authenticated' || status === 'api_access_denied') {
    return 'not_configured';
  }
  return status;
}

export function aiConfigStatus(): 'configured' | 'unavailable' {
  return describeAiConfig().configured ? 'configured' : 'unavailable';
}

export function publicProviderConfiguration(): {
  spotify: ConfigFlag;
  youtube: ConfigFlag;
  amazonMusic: ReturnType<typeof amazonConfigStatus>;
  ai: ReturnType<typeof aiConfigStatus>;
} {
  return {
    spotify: spotifyConfigStatus(),
    youtube: youtubeConfigStatus(),
    amazonMusic: amazonConfigStatus(),
    ai: aiConfigStatus(),
  };
}
