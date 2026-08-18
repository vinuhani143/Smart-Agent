import { Linking, StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { ProviderCard } from '@/components/ProviderCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { colors } from '@/constants/theme';
import { API_URL } from '@/constants/config';
import { useConnectProvider, useDisconnectProvider, useProviders } from '@/hooks/useProviders';
import { toUserMessage } from '@/utils/errors';

export function SettingsScreen() {
  const providers = useProviders();
  const connect = useConnectProvider();
  const disconnect = useDisconnectProvider();

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.section}>Music services</Text>
      {providers.isError ? <ErrorBanner message={toUserMessage(providers.error)} /> : null}
      {connect.isError ? <ErrorBanner message={toUserMessage(connect.error)} /> : null}
      {disconnect.isError ? <ErrorBanner message={toUserMessage(disconnect.error)} /> : null}
      {(providers.data?.providers ?? [])
        .filter((provider) => provider.id !== 'amazon_music')
        .map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            busy={connect.isPending || disconnect.isPending}
            connectLabel={provider.id === 'youtube' ? 'Connect YouTube' : 'Connect Spotify'}
            disconnectLabel={provider.id === 'youtube' ? 'Disconnect YouTube' : 'Disconnect Spotify'}
            onConnect={() => {
              if (provider.id === 'spotify') void connect.mutateAsync('spotify');
              if (provider.id === 'youtube') void connect.mutateAsync('google');
            }}
            onDisconnect={() => void disconnect.mutateAsync(provider.id)}
          />
        ))}
      <Text style={styles.section}>About</Text>
      <Text style={styles.body}>
        MusicMix manages playlists through official provider APIs. It never downloads or rips audio.
        Access tokens stay on the server. YouTube uses YouTube Data API v3.
      </Text>
      <Text style={styles.meta}>API: {API_URL}</Text>
      <Text
        style={styles.link}
        onPress={() => void Linking.openURL('https://developers.google.com/youtube/v3')}
      >
        YouTube Data API v3 docs
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  body: {
    color: colors.muted,
    lineHeight: 20,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  link: {
    color: colors.cyan,
    fontWeight: '600',
  },
});
