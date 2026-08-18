import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionCard } from '@/components/ActionCard';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/AppThemeProvider';

export function CreateHubScreen() {
  const { colors } = useAppTheme();
  return (
    <Screen>
      <Text style={[styles.title, { color: colors.text }]}>Create</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Start with AI, or build a playlist song by song.
      </Text>
      <View style={styles.stack}>
        <ActionCard
          emoji="🤖"
          title="Create with AI"
          subtitle="Describe your perfect playlist"
          onPress={() => router.push('/ai-playlist')}
        />
        <ActionCard
          emoji="🎵"
          title="Custom playlist"
          subtitle="Name it, then add songs from search"
          onPress={() => router.push('/playlist/new')}
        />
        <ActionCard
          emoji="🔄"
          title="Convert"
          subtitle="Copy a playlist to another service"
          onPress={() => router.push('/convert')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  stack: {
    gap: 12,
  },
});
