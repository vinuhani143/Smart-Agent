import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#3F1D2A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  text: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
});
