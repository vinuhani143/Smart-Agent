import { Redirect, Stack, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/ToastProvider';
import { useSession } from '@/hooks/useSession';
import { usePreferencesStore } from '@/store/preferencesStore';
import { AppThemeProvider, useAppTheme, usePaperTheme } from '@/theme/AppThemeProvider';

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

function RootNavigation() {
  const paper = usePaperTheme();
  const { dark, colors } = useAppTheme();
  const onboardingComplete = usePreferencesStore((state) => state.onboardingComplete);
  const segments = useSegments();
  const inOnboarding = segments[0] === 'onboarding';

  return (
    <PaperProvider theme={paper}>
      <ToastProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {!onboardingComplete && !inOnboarding ? <Redirect href="/onboarding" /> : null}
        {onboardingComplete && inOnboarding ? <Redirect href="/(tabs)" /> : null}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="convert" options={{ headerShown: true, title: 'Convert Playlist' }} />
          <Stack.Screen name="ai-playlist" options={{ headerShown: true, title: 'Create with AI' }} />
          <Stack.Screen name="playlist/ai" options={{ headerShown: true, title: 'Create with AI' }} />
          <Stack.Screen name="playlist/convert" options={{ headerShown: true, title: 'Convert Playlist' }} />
          <Stack.Screen name="playlist/new" options={{ headerShown: true, title: 'Custom Playlist' }} />
          <Stack.Screen name="playlist/[id]" options={{ headerShown: true, title: 'Playlist' }} />
          <Stack.Screen name="legal/privacy" options={{ headerShown: true, title: 'Privacy Policy' }} />
          <Stack.Screen name="legal/terms" options={{ headerShown: true, title: 'Terms' }} />
          <Stack.Screen name="auth/callback" />
        </Stack>
      </ToastProvider>
    </PaperProvider>
  );
}

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
        <AppThemeProvider>
          <RootNavigation />
        </AppThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
