import { Linking, StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { ProviderCard } from '@/components/ProviderCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { colors } from '@/constants/theme';
import { API_URL } from '@/constants/config';
import { useConnectProvider, useDisconnectProvider, useProviders } from '@/hooks/useProviders';
import type { ProviderId } from '@/types';
import { toUserMessage } from '@/utils/errors';

function connectKind(id: ProviderId): 'spotify' | 'google' | 'amazon' | null {
  if (id === 'spotify') {
    return 'spotify';
  }
  if (id === 'youtube') {
    return 'google';
  }
  if (id === 'amazon_music') {
    return 'amazon';
  }
  return null;
}

function connectLabel(id: ProviderId): string {
  if (id === 'youtube') {
    return 'Connect YouTube';
  }
  if (id === 'amazon_music') {
    return 'Connect Amazon Music';
  }
  return 'Connect Spotify';
}

function disconnectLabel(id: ProviderId): string {
  if (id === 'youtube') {
    return 'Disconnect YouTube';
  }
  if (id === 'amazon_music') {
    return 'Disconnect Amazon Music';
  }
  return 'Disconnect Spotify';
}

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
      {(providers.data?.providers ?? []).map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          busy={connect.isPending || disconnect.isPending}
          connectLabel={connectLabel(provider.id)}
          disconnectLabel={disconnectLabel(provider.id)}
          onConnect={() => {
            const kind = connectKind(provider.id);
            if (kind) {
              void connect.mutateAsync(kind);
            }
          }}
          onDisconnect={() => void disconnect.mutateAsync(provider.id)}
          onLearnMore={() => void Linking.openURL(provider.learnMoreUrl ?? 'https://developer.amazon.com/docs/music/API_web_overview.html')}
        />
      ))}
      <Text style={styles.section}>About</Text>
      <Text style={styles.body}>
        MusicMix manages playlists through official provider APIs. It never downloads or rips audio.
        Access tokens stay on the server. Amazon Music Web API access is a closed beta and stays disabled
        until Amazon approves credentials for this app.
      </Text>
      <Text style={styles.meta}>API: {API_URL}</Text>
      <Text
        style={styles.link}
        onPress={() => void Linking.openURL('https://developers.google.com/youtube/v3')}
      >
        YouTube Data API v3 docs
      </Text>
      <Text
        style={styles.link}
        onPress={() => void Linking.openURL('https://developer.amazon.com/docs/music/API_web_overview.html')}
      >
        Amazon Music Web API docs
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
