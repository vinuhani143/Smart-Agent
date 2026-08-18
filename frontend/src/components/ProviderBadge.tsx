import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { providerMeta } from '@/constants/providers';
import type { ProviderId } from '@/types';
import { useAppTheme } from '@/theme/AppThemeProvider';

export function ProviderBadge({ provider }: { provider: ProviderId }) {
  const { colors } = useAppTheme();
  const meta = providerMeta[provider];
  return (
    <View style={[styles.badge, { backgroundColor: colors.elevated, borderColor: colors.border }]} accessibilityLabel={meta.label}>
      <MaterialCommunityIcons name={meta.icon} size={14} color={meta.color} />
      <Text style={[styles.label, { color: colors.text }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
