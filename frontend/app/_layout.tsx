import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { paperTheme } from '@/constants/theme';
import { useSession } from '@/hooks/useSession';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const { ready } = useSession();
  const [client] = useState(queryClient);

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded || !ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <PaperProvider theme={paperTheme}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: paperTheme.colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="convert" options={{ headerShown: true, title: 'Convert Playlist', headerTintColor: '#F4F4F5', headerStyle: { backgroundColor: '#0B0B10' } }} />
            <Stack.Screen name="ai-playlist" options={{ headerShown: true, title: 'AI Playlist', headerTintColor: '#F4F4F5', headerStyle: { backgroundColor: '#0B0B10' } }} />
            <Stack.Screen name="playlist/ai" options={{ headerShown: true, title: 'AI Playlist', headerTintColor: '#F4F4F5', headerStyle: { backgroundColor: '#0B0B10' } }} />
            <Stack.Screen name="playlist/convert" options={{ headerShown: true, title: 'Convert Playlist', headerTintColor: '#F4F4F5', headerStyle: { backgroundColor: '#0B0B10' } }} />
            <Stack.Screen name="playlist/[id]" options={{ headerShown: true, title: 'Playlist', headerTintColor: '#F4F4F5', headerStyle: { backgroundColor: '#0B0B10' } }} />
            <Stack.Screen name="auth/callback" />
          </Stack>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
