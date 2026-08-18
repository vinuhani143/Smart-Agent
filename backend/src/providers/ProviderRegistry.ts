import { MusicProviderName } from '@prisma/client';
import { ConfigurationError, ProviderUnavailableError } from '../types/errors';
import type { MusicProvider, ProviderId } from '../types/provider';
import { AmazonMusicProvider } from './amazon/AmazonMusicProvider';
import { amazonDisabledError } from './amazon/amazonErrors';
import { SpotifyProvider } from './spotify/SpotifyProvider';
import { YouTubeProvider } from './youtube/YouTubeProvider';

const PROVIDERS: Record<ProviderId, MusicProvider> = {
  spotify: new SpotifyProvider(),
  youtube: new YouTubeProvider(),
  amazon_music: new AmazonMusicProvider(),
};

export function listProviders(): MusicProvider[] {
  return [PROVIDERS.spotify, PROVIDERS.youtube, PROVIDERS.amazon_music];
}

export function getProvider(id: ProviderId): MusicProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new ProviderUnavailableError(id, `Unknown music provider: ${id}`);
  }
  return provider;
}

export function requireEnabledProvider(id: ProviderId): MusicProvider {
  const provider = getProvider(id);
  if (!provider.isEnabled()) {
    if (id === 'amazon_music') {
      throw amazonDisabledError();
    }
    throw new ConfigurationError(
      `${provider.displayName} is not configured. Add official API credentials on the server and restart.`,
    );
  }
  return provider;
}

export function toPrismaProvider(id: ProviderId): MusicProviderName {
  switch (id) {
    case 'spotify':
      return MusicProviderName.SPOTIFY;
    case 'youtube':
      return MusicProviderName.YOUTUBE;
    case 'amazon_music':
      return MusicProviderName.AMAZON_MUSIC;
    default: {
      const exhaustive: never = id;
      throw new ProviderUnavailableError(String(exhaustive), 'Unknown music provider.');
    }
  }
}

export function fromPrismaProvider(name: MusicProviderName): ProviderId {
  switch (name) {
    case MusicProviderName.SPOTIFY:
      return 'spotify';
    case MusicProviderName.YOUTUBE:
      return 'youtube';
    case MusicProviderName.AMAZON_MUSIC:
      return 'amazon_music';
    default: {
      const exhaustive: never = name;
      throw new ProviderUnavailableError(String(exhaustive), 'Unknown music provider.');
    }
  }
}

export function parseProviderId(value: string): ProviderId {
  if (value === 'spotify' || value === 'youtube' || value === 'amazon_music') {
    return value;
  }
  throw new ProviderUnavailableError(value, `Unsupported music provider: ${value}`);
}
