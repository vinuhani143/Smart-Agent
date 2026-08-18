import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { providerMeta } from '@/constants/providers';
import { MIN_TOUCH } from '@/constants/theme';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { ProviderStatus } from '@/types';

interface ProviderCardProps {
  provider: ProviderStatus;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onManage?: () => void;
  onLearnMore?: () => void;
  busy?: boolean;
  compact?: boolean;
}

export function ProviderCard({
  provider,
  onConnect,
  onDisconnect,
  onManage,
  onLearnMore,
  busy,
  compact,
}: ProviderCardProps) {
  const { colors } = useAppTheme();
  const meta = providerMeta[provider.id];
  const statusLabel = !provider.enabled
    ? 'Unavailable'
    : provider.connected
      ? 'Connected'
      : 'Not Connected';
  const amazonUnavailable = provider.id === 'amazon_music' && !provider.enabled;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}22` }]}>
        <MaterialCommunityIcons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, { color: colors.text }]}>{meta.label}</Text>
        <Text
          style={[styles.status, { color: provider.connected ? colors.success : colors.muted }]}
          accessibilityLabel={`Status ${statusLabel}`}
        >
          {statusLabel}
        </Text>
        {provider.connected && provider.displayName ? (
          <Text style={[styles.reason, { color: colors.muted }]}>{provider.displayName}</Text>
        ) : null}
        {amazonUnavailable ? (
          <Text style={[styles.reason, { color: colors.muted }]}>Coming Soon / API access required</Text>
        ) : null}
      </View>
      {provider.enabled ? (
        <Pressable
          onPress={provider.connected ? (onManage ?? onDisconnect) : onConnect}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={provider.connected ? `Manage ${meta.label}` : `Connect ${meta.label}`}
          style={[
            styles.button,
            { backgroundColor: provider.connected ? colors.elevated : colors.accent, minHeight: MIN_TOUCH },
          ]}
        >
          <Text style={[styles.buttonText, { color: provider.connected ? colors.text : colors.onAccent }]}>
            {provider.connected ? (compact ? 'Manage' : 'Manage') : 'Connect'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={
            onLearnMore ??
            (() => void Linking.openURL(provider.learnMoreUrl ?? 'https://developer.amazon.com/docs/music/API_web_overview.html'))
          }
          accessibilityRole="button"
          accessibilityLabel="Learn about Amazon Music access"
          style={[styles.button, { backgroundColor: colors.elevated, minHeight: MIN_TOUCH }]}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>Learn more</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
  },
  reason: {
    fontSize: 11,
    marginTop: 2,
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 12,
  },
});
