import Constants from 'expo-constants';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Switch } from 'react-native-paper';
import { useState } from 'react';
import { router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppInput } from '@/components/AppInput';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { ProviderCard } from '@/components/ProviderCard';
import { Screen } from '@/components/Screen';
import { useAiStatus } from '@/hooks/useAiStatus';
import { useConnectProvider, useDisconnectProvider, useProviders } from '@/hooks/useProviders';
import { useAuthStore } from '@/store/authStore';
import { apiFetch, restoreWithRecoveryCode } from '@/services/api';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useToast } from '@/components/ToastProvider';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { ThemePreference } from '@/constants/theme';
import type { ProviderId, ProviderStatus } from '@/types';
import { toUserMessage } from '@/utils/errors';

function connectKind(id: ProviderId): 'spotify' | 'google' | 'amazon' {
  if (id === 'youtube') {
    return 'google';
  }
  if (id === 'amazon_music') {
    return 'amazon';
  }
  return 'spotify';
}

export function SettingsScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const userId = useAuthStore((state) => state.userId);
  const recoveryCode = useAuthStore((state) => state.recoveryCode);
  const accountWarning = useAuthStore((state) => state.accountWarning);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [restoreCode, setRestoreCode] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const themePreference = usePreferencesStore((state) => state.themePreference);
  const setThemePreference = usePreferencesStore((state) => state.setThemePreference);
  const notificationsEnabled = usePreferencesStore((state) => state.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((state) => state.setNotificationsEnabled);
  const providers = useProviders();
  const connect = useConnectProvider();
  const disconnect = useDisconnectProvider();
  const ai = useAiStatus();
  const [pendingDisconnect, setPendingDisconnect] = useState<ProviderStatus | null>(null);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

      <Text style={[styles.section, { color: colors.text }]}>Account</Text>
      <AppCard>
        <Text style={[styles.body, { color: colors.text }]}>Device-only MusicMix account</Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {userId ? `Account ID ${userId.slice(0, 8)}…` : 'Session is stored securely on this device.'}
        </Text>
        <Text style={[styles.meta, { color: colors.warning, marginTop: 8 }]}>
          {accountWarning ??
            'If you uninstall the app, clear data, or lose the recovery code, MusicMix playlists cannot be restored. There is no email login yet.'}
        </Text>
        {recoveryCode ? (
          <Text style={[styles.body, { color: colors.text, marginTop: 8 }]} accessibilityLabel="Recovery code">
            Recovery code: {recoveryCode}
          </Text>
        ) : (
          <Text style={[styles.meta, { color: colors.muted, marginTop: 8 }]}>
            The recovery code is shown once at first launch and stored only on this device.
          </Text>
        )}
        <AppInput
          label="Restore with recovery code"
          value={restoreCode}
          onChangeText={setRestoreCode}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Recovery code to restore a previous device account"
        />
        <AppButton
          label="Restore account"
          variant="secondary"
          loading={restoreBusy}
          accessibilityHint="Replaces this device session with the account for the recovery code"
          onPress={() => {
            setRestoreBusy(true);
            void restoreWithRecoveryCode(restoreCode, { deleteThrowaway: true })
              .then(() => {
                setRestoreCode('');
                toast.show('Account restored', 'success');
              })
              .catch((error: unknown) => toast.show(toUserMessage(error), 'error'))
              .finally(() => setRestoreBusy(false));
          }}
        />
        <AppButton
          label="Delete MusicMix account"
          variant="danger"
          onPress={() => setConfirmDeleteAccount(true)}
          accessibilityHint="Removes MusicMix data and stored tokens on the server"
        />
      </AppCard>

      <Text style={[styles.section, { color: colors.text }]}>Music Services</Text>
      {providers.isLoading ? <LoadingState label="Loading music services" /> : null}
      {providers.isError ? (
        <ErrorState message={toUserMessage(providers.error)} onRetry={() => void providers.refetch()} />
      ) : null}
      {(providers.data?.providers ?? []).map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          busy={connect.isPending || disconnect.isPending}
          onConnect={() => {
            void connect.mutateAsync(connectKind(provider.id)).then(
              () => toast.show('Connection successful', 'success'),
              (error: unknown) => toast.show(toUserMessage(error), 'error'),
            );
          }}
          onManage={() => setPendingDisconnect(provider)}
          onDisconnect={() => setPendingDisconnect(provider)}
          onLearnMore={() =>
            void Linking.openURL(provider.learnMoreUrl ?? 'https://developer.amazon.com/docs/music/API_web_overview.html')
          }
        />
      ))}

      <Text style={[styles.section, { color: colors.text }]}>AI Settings</Text>
      <AppCard>
        {ai.isLoading ? <LoadingState label="Checking AI configuration" /> : null}
        {ai.isError ? <ErrorState message={toUserMessage(ai.error)} onRetry={() => void ai.refetch()} /> : null}
        {ai.data ? (
          <>
            <Text style={[styles.body, { color: colors.text }]}>
              AI provider: {ai.data.configured ? ai.data.provider ?? 'configured' : 'Not configured'}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              Model status: {ai.data.modelConfigured ? 'Configured' : 'Not configured'}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              API configuration: {ai.data.apiKeyConfigured ? 'Configured' : 'Not configured'}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              API keys stay on the server and are never shown in the app.
            </Text>
          </>
        ) : null}
      </AppCard>

      <Text style={[styles.section, { color: colors.text }]}>Appearance</Text>
      <View style={styles.row}>
        {(['system', 'light', 'dark'] as ThemePreference[]).map((value) => (
          <Chip
            key={value}
            label={value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark'}
            active={themePreference === value}
            onPress={() => void setThemePreference(value)}
          />
        ))}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Notifications</Text>
      <View style={styles.switchRow}>
        <Text style={[styles.body, { color: colors.text, flex: 1 }]}>In-app feedback</Text>
        <Switch
          value={notificationsEnabled}
          onValueChange={(value) => void setNotificationsEnabled(value)}
          accessibilityLabel="In-app feedback"
        />
      </View>
      <Text style={[styles.meta, { color: colors.muted }]}>
        MusicMix uses short confirmations for actions like playlist created or connection failed. Push notifications are not sent.
      </Text>

      <Text style={[styles.section, { color: colors.text }]}>Privacy</Text>
      <AppCard>
        <Text style={[styles.body, { color: colors.muted }]}>
          MusicMix stores your account session on this device. Spotify, YouTube, and Amazon Music access tokens are stored securely on the MusicMix backend. The app does not download or rip audio.
        </Text>
      </AppCard>

      <Text style={[styles.section, { color: colors.text }]}>About</Text>
      <AppCard>
        <Text style={[styles.body, { color: colors.text }]}>MusicMix {version}</Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          Playlist manager for official music APIs. Amazon Music Web API access is a closed beta and stays unavailable until Amazon approves credentials for this app.
        </Text>
        <Pressable onPress={() => router.push('/legal/terms')} accessibilityRole="link" accessibilityLabel="Open draft terms">
          <Text style={[styles.body, { color: colors.text, marginTop: 8 }]}>Terms (draft — requires legal review)</Text>
        </Pressable>
        <Text style={[styles.meta, { color: colors.muted }]}>
          Use only official provider APIs and your own accounts. Do not attempt to bypass service restrictions.
        </Text>
        <Pressable onPress={() => router.push('/legal/privacy')} accessibilityRole="link" accessibilityLabel="Open draft privacy policy">
          <Text style={[styles.body, { color: colors.text, marginTop: 8 }]}>Privacy Policy (draft — requires legal review)</Text>
        </Pressable>
        <Text style={[styles.meta, { color: colors.muted }]}>
          Account and provider tokens are stored securely on the backend. See Privacy above.
        </Text>
        <Text style={[styles.body, { color: colors.text, marginTop: 8 }]}>Open-source licenses</Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          This app uses Expo, React Native, React Native Paper, TanStack Query, Zustand, Express, and Prisma. Their licenses apply to those packages.
        </Text>
      </AppCard>

      <ConfirmDialog
        visible={Boolean(pendingDisconnect)}
        title={`Disconnect ${pendingDisconnect?.name ?? 'service'}?`}
        message="You can connect again later from Settings. Playlists already saved in MusicMix stay on this device."
        confirmLabel="Disconnect"
        danger
        onCancel={() => setPendingDisconnect(null)}
        onConfirm={() => {
          if (!pendingDisconnect) {
            return;
          }
          const id = pendingDisconnect.id;
          setPendingDisconnect(null);
          void disconnect.mutateAsync(id).then(
            () => toast.show('Disconnected', 'info'),
            (error: unknown) => toast.show(toUserMessage(error), 'error'),
          );
        }}
      />
      <ConfirmDialog
        visible={confirmDeleteAccount}
        title="Delete MusicMix account?"
        message="This deletes your MusicMix playlists, conversions, AI jobs, and stored provider tokens. Playlists already created on Spotify, YouTube, or Amazon Music are not deleted there. This cannot be undone."
        confirmLabel="Delete account"
        danger
        onCancel={() => setConfirmDeleteAccount(false)}
        onConfirm={() => {
          setConfirmDeleteAccount(false);
          void apiFetch('/api/auth/account', { method: 'DELETE' })
            .then(() => clearSession())
            .then(() => toast.show('Account deleted', 'info'))
            .catch((error: unknown) => toast.show(toUserMessage(error), 'error'));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  section: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
});
