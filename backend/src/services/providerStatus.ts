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

export function describePublicRedirect(uri: string): {
  configured: boolean;
  https: boolean;
  localhost: boolean;
  path: string | null;
} {
  const raw = uri.trim();
  if (!raw) {
    return { configured: false, https: false, localhost: false, path: null };
  }
  try {
    const parsed = new URL(raw);
    return {
      configured: true,
      https: parsed.protocol === 'https:',
      localhost: /localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2/i.test(parsed.hostname),
      path: parsed.pathname,
    };
  } catch {
    return { configured: true, https: false, localhost: false, path: null };
  }
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
