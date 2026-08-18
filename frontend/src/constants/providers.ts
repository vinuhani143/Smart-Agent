import type { ProviderId } from '@/types';
import { colors } from './theme';

export const providerMeta: Record<
  ProviderId,
  { label: string; color: string; icon: 'spotify' | 'youtube' | 'music' }
> = {
  spotify: { label: 'Spotify', color: colors.spotify, icon: 'spotify' },
  youtube: { label: 'YouTube', color: colors.youtube, icon: 'youtube' },
  amazon_music: { label: 'Amazon Music', color: colors.amazon, icon: 'music' },
};
