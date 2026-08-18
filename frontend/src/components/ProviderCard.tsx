import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { providerMeta } from '@/constants/providers';
import { colors } from '@/constants/theme';
import type { ProviderStatus } from '@/types';

interface ProviderCardProps {
  provider: ProviderStatus;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onLearnMore?: () => void;
  busy?: boolean;
  connectLabel?: string;
  disconnectLabel?: string;
}

export function ProviderCard({
  provider,
  onConnect,
  onDisconnect,
  onLearnMore,
  busy,
  connectLabel,
  disconnectLabel,
}: ProviderCardProps) {
  const meta = providerMeta[provider.id];
  const statusLabel = !provider.enabled
    ? provider.accessStatus === 'closed_beta' || provider.id === 'amazon_music'
      ? 'Unavailable'
      : 'Not available'
    : provider.connected
      ? 'Connected'
      : 'Not Connected';
  const actionLabel = provider.connected
    ? (disconnectLabel ?? 'Disconnect')
    : (connectLabel ?? 'Connect');

  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}22` }]}>
        <MaterialCommunityIcons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.name}>{meta.label}</Text>
        <Text style={[styles.status, provider.connected && styles.connected]}>{statusLabel}</Text>
        {provider.connected && provider.displayName ? (
          <Text style={styles.reason}>{provider.displayName}</Text>
        ) : null}
        {provider.connected && provider.subscriptionTier ? (
          <Text style={styles.reason}>Plan: {provider.subscriptionTier}</Text>
        ) : null}
        {provider.id === 'amazon_music' && !provider.enabled ? (
          <Text style={styles.reason}>Amazon Music integration is currently unavailable.</Text>
        ) : provider.unavailableReason && !provider.enabled ? (
          <Text style={styles.reason}>{provider.unavailableReason}</Text>
        ) : null}
      </View>
      {provider.enabled ? (
        <Pressable
          onPress={provider.connected ? onDisconnect : onConnect}
          disabled={busy}
          style={[styles.button, provider.connected && styles.buttonGhost]}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : provider.id === 'amazon_music' && onLearnMore ? (
        <Pressable onPress={onLearnMore} style={[styles.button, styles.buttonGhost]}>
          <Text style={styles.buttonText}>Learn about Amazon Music access</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  status: {
    color: colors.muted,
    fontSize: 13,
  },
  connected: {
    color: colors.success,
  },
  reason: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonGhost: {
    backgroundColor: colors.elevated,
  },
  buttonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
});
