import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionCard } from '@/components/ActionCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ProviderCard } from '@/components/ProviderCard';
import { Screen } from '@/components/Screen';
import { colors, greetingForHour } from '@/constants/theme';
import { useConnectProvider, useDisconnectProvider, useProviders } from '@/hooks/useProviders';
import { toUserMessage } from '@/utils/errors';

export function HomeScreen() {
  const greeting = greetingForHour(new Date().getHours());
  const providers = useProviders();
  const connect = useConnectProvider();
  const disconnect = useDisconnectProvider();

  return (
    <Screen>
      <View>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.headline}>Create your perfect playlist</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <ActionCard
            emoji="🎧"
            title="Create Playlist"
            subtitle="Name, mood, and filters"
            onPress={() => router.push('/(tabs)/create')}
          />
          <ActionCard
            emoji="🤖"
            title="AI Playlist"
            subtitle="Describe what you want"
            onPress={() => router.push('/ai-playlist')}
          />
        </View>
        <View style={styles.gridRow}>
          <ActionCard
            emoji="🔄"
            title="Convert Playlist"
            subtitle="Copy between services"
            onPress={() => router.push('/convert')}
          />
          <ActionCard
            emoji="⭐"
            title="My Playlists"
            subtitle="Saved locally & on server"
            onPress={() => router.push('/(tabs)/playlists')}
          />
        </View>
      </View>

      <Text style={styles.section}>Connected services</Text>
      {providers.isError ? <ErrorBanner message={toUserMessage(providers.error)} /> : null}
      {(providers.data?.providers ?? []).map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          busy={connect.isPending || disconnect.isPending}
          onConnect={() => {
            if (provider.id === 'spotify') {
              void connect.mutateAsync('spotify');
            } else if (provider.id === 'youtube') {
              void connect.mutateAsync('google');
            }
          }}
          onDisconnect={() => void disconnect.mutateAsync(provider.id)}
        />
      ))}
      {providers.isSuccess && providers.data.providers.length === 0 ? (
        <EmptyState title="No providers" body="The server did not return any music services." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
  },
  headline: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -0.4,
  },
  grid: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
});
