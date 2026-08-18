import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProviderBadge } from '@/components/ProviderBadge';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { PlaylistSummary, ProviderId } from '@/types';
import { formatDuration, formatTrackCount } from '@/utils/format';

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  onPress: () => void;
  onEdit?: () => void;
  onConvert?: () => void;
  onDelete?: () => void;
}

function asProvider(value: string | null | undefined): ProviderId | undefined {
  if (value === 'SPOTIFY' || value === 'spotify') {
    return 'spotify';
  }
  if (value === 'YOUTUBE' || value === 'youtube') {
    return 'youtube';
  }
  if (value === 'AMAZON_MUSIC' || value === 'amazon_music') {
    return 'amazon_music';
  }
  return undefined;
}

export function PlaylistCard({ playlist, onPress, onEdit, onConvert, onDelete }: PlaylistCardProps) {
  const { colors } = useAppTheme();
  const provider = asProvider(playlist.sourceProvider);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${playlist.name}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.88 },
      ]}
    >
      {playlist.coverImageUrl ? (
        <Image source={{ uri: playlist.coverImageUrl }} style={styles.cover} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.cover, styles.coverFallback, { backgroundColor: colors.elevated }]}>
          <Ionicons name="albums" size={28} color={colors.accent} />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {formatTrackCount(playlist.trackCount)} · {formatDuration(playlist.totalDurationMs)}
        </Text>
        {provider ? <ProviderBadge provider={provider} /> : null}
        {playlist.aiGenerated ? (
          <Text style={[styles.meta, { color: colors.cyan }]}>AI generated</Text>
        ) : null}
        <View style={styles.actions}>
          {onEdit ? (
            <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${playlist.name}`} hitSlop={8}>
              <Text style={[styles.link, { color: colors.accent }]}>Edit</Text>
            </Pressable>
          ) : null}
          {onConvert ? (
            <Pressable onPress={onConvert} accessibilityRole="button" accessibilityLabel={`Convert ${playlist.name}`} hitSlop={8}>
              <Text style={[styles.link, { color: colors.accent }]}>Convert</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Delete ${playlist.name}`} hitSlop={8}>
              <Text style={[styles.link, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
  },
  cover: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  link: {
    fontWeight: '700',
    fontSize: 13,
  },
});
