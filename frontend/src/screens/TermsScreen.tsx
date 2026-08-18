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
        REQUIRES LEGAL REVIEW. This is a placeholder structure, not a contract.
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>Terms of Service (draft)</Text>

      <Text style={[styles.heading, { color: colors.text }]}>Service description</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        MusicMix helps you search, save, convert, and generate playlists by calling official Spotify, YouTube, and
        (when approved) Amazon Music APIs. MusicMix does not stream audio and does not bypass provider restrictions.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Acceptable use</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Use only your own music-service accounts. Do not attempt to scrape, rip, or circumvent DRM or API access
        controls. Do not abuse rate limits or share another person’s recovery code.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Third-party music services</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Spotify, YouTube, and Amazon Music terms still apply. Amazon Music Web API access is subject to Amazon
        approval. MusicMix does not grant you rights in those catalogs.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Account responsibility</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        This version uses a device-only account. If you uninstall the app, clear data, or lose the recovery code,
        MusicMix data may be unrecoverable. You are responsible for keeping the recovery code private.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Termination</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        You may delete your MusicMix account at any time from Settings. The operator may suspend access for abuse or
        legal reasons. Counsel must define notice and appeal procedures before publication.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Limitations</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Placeholder: limitations of liability, warranty disclaimers, and governing law must be written by counsel. This
        draft makes no legal guarantees.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Contact information</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Placeholder: add a support email or postal address before Play Store submission. Do not invent a contact that
        is not monitored.
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
  heading: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
