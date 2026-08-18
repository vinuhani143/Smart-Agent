import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
export const MIN_TOUCH = 44;

export const brand = {
  spotify: '#1DB954',
  youtube: '#FF0000',
  amazon: '#FF9900',
};

export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentMuted: string;
  cyan: string;
  danger: string;
  success: string;
  warning: string;
  onAccent: string;
  skeleton: string;
  overlay: string;
}

export const darkColors: ThemeColors = {
  background: '#0B0B10',
  surface: '#16161F',
  card: '#1C1C28',
  elevated: '#232333',
  border: '#2E2E42',
  text: '#F4F4F5',
  muted: '#A1A1AA',
  accent: '#A78BFA',
  accentMuted: '#3B2A63',
  cyan: '#22D3EE',
  danger: '#FB7185',
  success: '#34D399',
  warning: '#FBBF24',
  onAccent: '#0B0B10',
  skeleton: '#2A2A3A',
  overlay: 'rgba(8,8,14,0.72)',
};

export const lightColors: ThemeColors = {
  background: '#F7F6FB',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  elevated: '#F1F0F7',
  border: '#E4E2EE',
  text: '#18181B',
  muted: '#5B5B66',
  accent: '#6D28D9',
  accentMuted: '#EDE7FE',
  cyan: '#0E7490',
  danger: '#BE123C',
  success: '#047857',
  warning: '#B45309',
  onAccent: '#FFFFFF',
  skeleton: '#E7E5F0',
  overlay: 'rgba(24,24,27,0.45)',
};

/** Dark palette kept for existing imports; screens should prefer useAppTheme(). */
export const colors = { ...darkColors, ...brand };

export function paperThemeFrom(palette: ThemeColors, dark: boolean): MD3Theme {
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      secondary: palette.cyan,
      background: palette.background,
      surface: palette.surface,
      surfaceVariant: palette.card,
      onSurface: palette.text,
      onBackground: palette.text,
      outline: palette.border,
      error: palette.danger,
    },
  };
}

export const paperTheme = paperThemeFrom(darkColors, true);

export { greetingForHour } from '@/utils/greeting';

export type ThemePreference = 'system' | 'light' | 'dark';
