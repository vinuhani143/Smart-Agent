import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

interface EmptyStateProps {
  title: string;
  body: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 28,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
