import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { ThemePreference } from '@/constants/theme';

const ONBOARDING_KEY = 'musicmix.onboarding.complete';
const THEME_KEY = 'musicmix.theme';
const NOTIFICATIONS_KEY = 'musicmix.notifications';

interface PreferencesState {
  hydrated: boolean;
  onboardingComplete: boolean;
  themePreference: ThemePreference;
  notificationsEnabled: boolean;
  hydrate: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setThemePreference: (value: ThemePreference) => Promise<void>;
  setNotificationsEnabled: (value: boolean) => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  hydrated: false,
  onboardingComplete: false,
  themePreference: 'system',
  notificationsEnabled: true,
  async hydrate() {
    const [onboarding, theme, notifications] = await Promise.all([
      SecureStore.getItemAsync(ONBOARDING_KEY),
      SecureStore.getItemAsync(THEME_KEY),
      SecureStore.getItemAsync(NOTIFICATIONS_KEY),
    ]);
    set({
      hydrated: true,
      onboardingComplete: onboarding === '1',
      themePreference: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
      notificationsEnabled: notifications !== '0',
    });
  },
  async completeOnboarding() {
    await SecureStore.setItemAsync(ONBOARDING_KEY, '1');
    set({ onboardingComplete: true });
  },
  async setThemePreference(value) {
    await SecureStore.setItemAsync(THEME_KEY, value);
    set({ themePreference: value });
  },
  async setNotificationsEnabled(value) {
    await SecureStore.setItemAsync(NOTIFICATIONS_KEY, value ? '1' : '0');
    set({ notificationsEnabled: value });
  },
}));
