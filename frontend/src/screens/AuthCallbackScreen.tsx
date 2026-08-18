import { useLocalSearchParams, router } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { LoadingState } from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';
import { useAppTheme } from '@/theme/AppThemeProvider';

export function AuthCallbackScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ status?: string; message?: string }>();
  const failed = params.status === 'error';

  useEffect(() => {
    toast.show(failed ? 'Connection failed' : 'Connection successful', failed ? 'error' : 'success');
    const timer = setTimeout(() => {
      router.replace('/(tabs)/settings');
    }, 800);
    return () => clearTimeout(timer);
  }, [failed, toast]);

  return (
    <Screen>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>
        {failed ? 'Connection failed' : 'Connected'}
      </Text>
      <Text style={{ color: colors.muted }}>{params.message ?? 'Returning to Settings…'}</Text>
      <LoadingState label="Opening Settings" />
    </Screen>
  );
}
