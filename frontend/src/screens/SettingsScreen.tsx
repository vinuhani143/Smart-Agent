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
      {(providers.data?.providers ?? []).map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          busy={connect.isPending || disconnect.isPending}
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
        Access tokens stay on the server.
      </Text>
      <Text style={styles.meta}>API: {API_URL}</Text>
      <Text style={styles.link} onPress={() => void Linking.openURL('https://developer.spotify.com/documentation/web-api')}>
        Spotify Web API docs
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
