import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  darkColors,
  lightColors,
  paperThemeFrom,
  type ThemeColors,
  type ThemePreference,
} from '@/constants/theme';
import { usePreferencesStore } from '@/store/preferencesStore';

interface AppThemeValue {
  colors: ThemeColors;
  dark: boolean;
  preference: ThemePreference;
}

const ThemeContext = createContext<AppThemeValue>({
  colors: darkColors,
  dark: true,
  preference: 'system',
});

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const preference = usePreferencesStore((state) => state.themePreference);
  const system = useColorScheme();
  const dark = preference === 'system' ? system !== 'light' : preference === 'dark';
  const value = useMemo<AppThemeValue>(
    () => ({
      colors: dark ? darkColors : lightColors,
      dark,
      preference,
    }),
    [dark, preference],
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useAppTheme(): AppThemeValue {
  return useContext(ThemeContext);
}

export function usePaperTheme() {
  const { colors, dark } = useAppTheme();
  return paperThemeFrom(colors, dark);
}
