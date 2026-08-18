import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/AppThemeProvider';

interface ActionCardProps {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

export function ActionCard({ emoji, title, subtitle, onPress }: ActionCardProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 128,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  emoji: {
    fontSize: 28,
  },
  copy: {
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
});
