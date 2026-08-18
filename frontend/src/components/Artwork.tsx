import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { isRemoteArtworkUrl } from '@/utils/artwork';

export function Artwork({
  uri,
  style,
  accessibilityLabel,
}: {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  if (!isRemoteArtworkUrl(uri)) {
    return (
      <View style={[style, { backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="musical-notes" size={22} color={colors.muted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      accessibilityIgnoresInvertColors
      accessibilityLabel={accessibilityLabel}
    />
  );
}
