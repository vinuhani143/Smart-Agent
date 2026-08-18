import { useLocalSearchParams, router } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { colors } from '@/constants/theme';

export function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ status?: string; message?: string }>();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(tabs)/settings');
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Screen>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>
        {params.status === 'error' ? 'Connection failed' : 'Connected'}
      </Text>
      <Text style={{ color: colors.muted }}>
        {params.message ?? 'Returning to Settings…'}
      </Text>
    </Screen>
  );
}
