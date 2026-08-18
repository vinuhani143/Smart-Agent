import { StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { isAmazonMusicLive } from '@/constants/providers';
import type { ProviderId, ProviderStatus } from '@/types';
import { useAppTheme } from '@/theme/AppThemeProvider';

interface ProviderSelectorProps {
  value: ProviderId | 'all' | 'both';
  onChange: (value: ProviderId | 'all' | 'both') => void;
  providers?: ProviderStatus[];
  includeAll?: boolean;
  includeBoth?: boolean;
  requireConnected?: boolean;
}

export function ProviderSelector({
  value,
  onChange,
  providers,
  includeAll,
  includeBoth,
  requireConnected,
}: ProviderSelectorProps) {
  const { colors } = useAppTheme();
  const amazonLive = isAmazonMusicLive(providers);
  const connected = (id: ProviderId) => providers?.find((item) => item.id === id)?.connected === true;

  return (
    <View style={styles.wrap}>
      {includeAll ? <Chip label="All" active={value === 'all'} onPress={() => onChange('all')} /> : null}
      <Chip
        label="Spotify"
        active={value === 'spotify'}
        disabled={requireConnected && !connected('spotify')}
        onPress={() => onChange('spotify')}
      />
      <Chip
        label="YouTube"
        active={value === 'youtube'}
        disabled={requireConnected && !connected('youtube')}
        onPress={() => onChange('youtube')}
      />
      {amazonLive ? (
        <Chip
          label="Amazon Music"
          active={value === 'amazon_music'}
          disabled={requireConnected && !connected('amazon_music')}
          onPress={() => onChange('amazon_music')}
        />
      ) : (
        <Chip label="Amazon Music — Coming Soon" disabled />
      )}
      {includeBoth ? <Chip label="Both" active={value === 'both'} onPress={() => onChange('both')} /> : null}
      {!amazonLive ? (
        <Text style={[styles.hint, { color: colors.muted }]}>Amazon Music isn't available yet</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hint: {
    width: '100%',
    fontSize: 12,
  },
});
