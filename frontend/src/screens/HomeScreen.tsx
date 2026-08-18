import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionCard } from '@/components/ActionCard';
import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { ProviderCard } from '@/components/ProviderCard';
import { Screen } from '@/components/Screen';
import { greetingForHour } from '@/utils/greeting';
import { useConnectProvider, useProviders } from '@/hooks/useProviders';
import { useToast } from '@/components/ToastProvider';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { toUserMessage } from '@/utils/errors';

const QUICK_PROMPTS = [
  { label: '90s Telugu Hits', prompt: '90s Telugu Hits' },
  { label: 'Workout 60 min', prompt: 'Create a 60 minute workout playlist' },
  { label: 'Night Drive', prompt: 'Night Drive' },
  { label: 'Romantic', prompt: 'Romantic playlist' },
  { label: 'Relaxing', prompt: 'Relaxing music' },
  { label: 'Party', prompt: 'Party playlist' },
];

export function HomeScreen() {
  const { colors } = useAppTheme();
  const greeting = greetingForHour(new Date().getHours());
  const providers = useProviders();
  const connect = useConnectProvider();
  const toast = useToast();

  return (
    <Screen>
      <View>
        <Text style={[styles.greeting, { color: colors.muted }]}>{greeting}</Text>
        <Text style={[styles.headline, { color: colors.text }]}>What do you want to listen to?</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <ActionCard
            emoji="🤖"
            title="AI Playlist"
            subtitle="Describe your perfect playlist"
            onPress={() => router.push('/ai-playlist')}
          />
          <ActionCard
            emoji="🎵"
            title="Custom Playlist"
            subtitle="Build one yourself"
            onPress={() => router.push('/playlist/new')}
          />
        </View>
        <ActionCard
          emoji="🔄"
          title="Convert Playlist"
          subtitle="Move playlists between services"
          onPress={() => router.push('/convert')}
        />
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Quick AI prompts</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {QUICK_PROMPTS.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => router.push({ pathname: '/ai-playlist', params: { prompt: item.prompt } })}
            style={[styles.quick, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.quickText, { color: colors.text }]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <AppCard>
        <Text style={[styles.section, { color: colors.text, marginTop: 0 }]}>Your Music Services</Text>
        {providers.isLoading ? <LoadingState label="Checking connected services" /> : null}
        {providers.isError ? (
          <ErrorState message={toUserMessage(providers.error)} onRetry={() => void providers.refetch()} />
        ) : null}
        {(providers.data?.providers ?? []).map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            compact
            busy={connect.isPending}
            onConnect={() => {
              const kind = provider.id === 'youtube' ? 'google' : provider.id === 'amazon_music' ? 'amazon' : 'spotify';
              void connect.mutateAsync(kind).then(
                () => toast.show('Connection successful', 'success'),
                (error: unknown) => toast.show(toUserMessage(error), 'error'),
              );
            }}
            onManage={() => router.push('/(tabs)/settings')}
            onLearnMore={() =>
              void Linking.openURL(provider.learnMoreUrl ?? 'https://developer.amazon.com/docs/music/API_web_overview.html')
            }
          />
        ))}
        {providers.isSuccess && providers.data.providers.length === 0 ? (
          <EmptyState title="No music services" body="The server did not return any providers." />
        ) : null}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: {
    fontSize: 16,
    fontWeight: '600',
  },
  headline: {
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
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  quickRow: {
    gap: 8,
    paddingRight: 8,
  },
  quick: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  quickText: {
    fontWeight: '700',
    fontSize: 14,
  },
});
