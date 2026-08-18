import { Pressable, StyleSheet, Text } from 'react-native';
import { MIN_TOUCH } from '@/constants/theme';
import { useAppTheme } from '@/theme/AppThemeProvider';

interface ChipProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export function Chip({ label, active, disabled, onPress }: ChipProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accentMuted : colors.card,
          borderColor: active ? colors.accent : colors.border,
          minHeight: MIN_TOUCH,
        },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.text, { color: active ? colors.text : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});
