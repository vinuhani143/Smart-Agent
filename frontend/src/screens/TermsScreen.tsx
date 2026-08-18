import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/AppThemeProvider';

export function TermsScreen() {
  const { colors } = useAppTheme();
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={[styles.banner, { color: colors.warning, backgroundColor: colors.accentMuted }]}
      >
        REQUIRES LEGAL REVIEW. This is a placeholder, not a contract.
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>Terms of Service (draft)</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        MusicMix is a playlist manager that calls official Spotify, YouTube, and (when approved) Amazon Music APIs. You
        must use your own accounts. MusicMix does not stream audio and does not bypass provider restrictions.
      </Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Provider terms still apply. Amazon Music Web API access is subject to Amazon approval. AI playlist generation
        sends your prompt to the configured LLM provider when that feature is enabled.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: 12,
    borderRadius: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
