import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/AppThemeProvider';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

export function SkeletonBlock({
  height = 72,
  width = '100%',
}: {
  height?: number;
  width?: number | `${number}%`;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel="Loading content"
      style={[styles.skeleton, { backgroundColor: colors.skeleton, height, width }]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  skeleton: {
    borderRadius: 16,
    width: '100%',
  },
});
