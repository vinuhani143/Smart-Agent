import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'MusicMix',
  slug: 'musicmix',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'musicmix',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.musicmix.app',
  },
  android: {
    package: 'com.musicmix.app',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#0B0B10',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    intentFilters: [
      {
        action: 'VIEW',
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          {
            scheme: 'musicmix',
            host: 'auth',
            pathPrefix: '/callback',
          },
        ],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0B0B10',
      },
    ],
    'expo-secure-store',
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
