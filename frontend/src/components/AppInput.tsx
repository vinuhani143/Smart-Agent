import { StyleSheet } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useAppTheme } from '@/theme/AppThemeProvider';

interface AppInputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
  autoCorrect?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  returnKeyType?: 'done' | 'search' | 'next';
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  maxLength?: number;
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCorrect,
  autoCapitalize,
  returnKeyType,
  onSubmitEditing,
  accessibilityLabel,
  maxLength,
}: AppInputProps) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCorrect={autoCorrect}
      autoCapitalize={autoCapitalize}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      mode="outlined"
      accessibilityLabel={accessibilityLabel ?? label}
      maxLength={maxLength}
      style={[styles.input, multiline && styles.multiline, { backgroundColor: colors.card }]}
      outlineColor={colors.border}
      activeOutlineColor={colors.accent}
      textColor={colors.text}
      placeholderTextColor={colors.muted}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 16,
  },
  multiline: {
    minHeight: 120,
  },
});
