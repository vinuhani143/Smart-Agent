import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/AppThemeProvider';

export function PrivacyPolicyScreen() {
  const { colors } = useAppTheme();
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={[styles.banner, { color: colors.warning, backgroundColor: colors.accentMuted }]}
      >
        REQUIRES FINAL LEGAL REVIEW. This is an inventory placeholder, not a compliance certification.
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>Privacy Policy (draft)</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        MusicMix stores a device-only account id, playlist and track metadata, encrypted music-service tokens on the
        server, and AI prompt text used to generate playlist previews. It does not store copyrighted audio. See
        docs/privacy-policy-data-inventory.md in the source repository for the current inventory.
      </Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        You can delete your MusicMix account from Settings. That removes local MusicMix data and stored tokens. Playlists
        already created on Spotify, YouTube, or Amazon Music stay on those services unless you delete them there.
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
