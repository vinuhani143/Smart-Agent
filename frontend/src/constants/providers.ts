import type { ProviderId, ProviderStatus } from '@/types';
import { colors } from './theme';

export const providerMeta: Record<
  ProviderId,
  { label: string; color: string; icon: 'spotify' | 'youtube' | 'music' }
> = {
  spotify: { label: 'Spotify', color: colors.spotify, icon: 'spotify' },
  youtube: { label: 'YouTube', color: colors.youtube, icon: 'youtube' },
  amazon_music: { label: 'Amazon Music', color: colors.amazon, icon: 'music' },
};

export function providerDisplayName(id: ProviderId): string {
  return providerMeta[id].label;
}

/** True only when the feature flag is on and official Amazon credentials are configured. */
export function isAmazonMusicLive(providers: ProviderStatus[] | undefined): boolean {
  return Boolean(providers?.some((item) => item.id === 'amazon_music' && item.enabled));
}

export function isAmazonMusicReady(providers: ProviderStatus[] | undefined): boolean {
  return Boolean(providers?.some((item) => item.id === 'amazon_music' && item.enabled && item.connected));
}
