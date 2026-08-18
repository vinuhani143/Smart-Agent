import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

interface ActionCardProps {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

export function ActionCard({ emoji, title, subtitle, onPress }: ActionCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 120,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  emoji: {
    fontSize: 28,
  },
  copy: {
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
  },
});
