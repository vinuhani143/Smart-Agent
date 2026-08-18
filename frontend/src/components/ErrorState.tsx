import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/AppButton';
import { useAppTheme } from '@/theme/AppThemeProvider';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{message}</Text>
      {onRetry ? <AppButton label="Try again" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: colors.accentMuted, borderColor: colors.danger }]}
    >
      <Text style={[styles.bannerText, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  banner: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
