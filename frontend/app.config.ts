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
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_CONTACTS',
      'android.permission.READ_PHONE_STATE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
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
  extra: {
    eas: {
      projectId: '9cd5816b-ce26-40f2-b36a-1bdeba487523',
    },
  },
};

export default config;
