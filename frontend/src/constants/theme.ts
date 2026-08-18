import { MD3DarkTheme, type MD3Theme } from 'react-native-paper';

export const colors = {
  background: '#0B0B10',
  surface: '#16161F',
  card: '#1C1C28',
  elevated: '#232333',
  border: '#2E2E42',
  text: '#F4F4F5',
  muted: '#A1A1AA',
  accent: '#A78BFA',
  accentMuted: '#7C3AED',
  cyan: '#22D3EE',
  danger: '#FB7185',
  success: '#34D399',
  warning: '#FBBF24',
  spotify: '#1DB954',
  youtube: '#FF0000',
  amazon: '#FF9900',
};

export const paperTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.accent,
    secondary: colors.cyan,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.card,
    onSurface: colors.text,
    onBackground: colors.text,
    outline: colors.border,
    error: colors.danger,
  },
};

export function greetingForHour(hour: number): string {
  if (hour < 12) {
    return 'Good Morning';
  }
  if (hour < 18) {
    return 'Good Afternoon';
  }
  return 'Good Evening';
}
