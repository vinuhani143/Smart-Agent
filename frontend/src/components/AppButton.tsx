import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { MIN_TOUCH } from '@/constants/theme';
import { useAppTheme } from '@/theme/AppThemeProvider';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityHint,
}: AppButtonProps) {
  const { colors } = useAppTheme();
  const background =
    variant === 'primary'
      ? colors.accent
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.elevated
          : 'transparent';
  const color = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.onAccent : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: variant === 'ghost' ? colors.border : background },
        pressed && { opacity: 0.86, transform: [{ scale: 0.99 }] },
        (disabled || loading) && { opacity: 0.45 },
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.label, { color }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
});
