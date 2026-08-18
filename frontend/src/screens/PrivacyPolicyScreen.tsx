import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '@/components/AppButton';
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
        REQUIRES FINAL LEGAL REVIEW. This is an engineering draft, not a compliance certification.
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>Privacy Policy (draft)</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        MusicMix is a playlist manager. It does not stream or store copyrighted audio. Counsel must review this text
        before Play Store publication.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Account information</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        MusicMix creates a device-only account id and optional display name. There is no email login in this version. A
        recovery code hash may be stored so you can restore the same account if you saved the code.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Music provider connections</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        If you connect Spotify, YouTube, or Amazon Music, MusicMix stores that provider’s account id and encrypted
        OAuth tokens on the MusicMix server so it can call official APIs on your behalf.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Playlist and track metadata</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Names, descriptions, cover URLs, titles, artists, albums, durations, ISRCs, and provider track ids may be stored
        to show and convert playlists. Audio files are not stored.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>OAuth tokens</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Access and refresh tokens are encrypted at rest (AES-256-GCM) and are not sent to the mobile app. They are sent
        only to the matching official provider.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>AI requests</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        If AI playlist generation is enabled, your prompt and parsed search criteria are stored on MusicMix and sent to
        the configured LLM vendor. MusicMix does not invent songs; it searches official catalogs.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Third-party services</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Spotify, Google/YouTube, Amazon (when approved), and the optional LLM vendor process data under their own terms.
        MusicMix does not sell personal information.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Security measures</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Production API traffic uses HTTPS. Provider tokens are encrypted. Secrets stay in server environment variables,
        not in the app bundle.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Retention</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Account, playlist, conversion, and AI job data are kept until you delete the account or the specific playlist.
        Short-lived OAuth CSRF state expires in about 10 minutes. Host logs follow the operator’s retention policy.
      </Text>

      <Text style={[styles.heading, { color: colors.text }]}>Delete Account / Delete My Data</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Settings → Delete MusicMix account removes MusicMix playlists, conversions, AI jobs, and stored provider tokens.
        Playlists already created on Spotify, YouTube, or Amazon Music are not deleted there unless you delete them on
        those services.
      </Text>
      <AppButton
        label="Delete Account / Delete My Data"
        variant="danger"
        accessibilityHint="Opens Settings so you can delete your MusicMix account"
        onPress={() => router.push('/(tabs)/settings')}
      />
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
