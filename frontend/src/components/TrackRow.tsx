import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProviderBadge } from '@/components/ProviderBadge';
import { IconButton } from '@/components/Screen';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { TrackResult } from '@/types';
import { formatDuration } from '@/utils/format';

interface TrackRowProps {
  track: TrackResult;
  onAdd?: () => void;
  onRemove?: () => void;
  onSelect?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onReplace?: () => void;
  selected?: boolean;
  confidence?: number;
  actionLabel?: string;
}

export function TrackRow({
  track,
  onAdd,
  onRemove,
  onSelect,
  onMoveUp,
  onMoveDown,
  onReplace,
  selected,
  confidence,
  actionLabel,
}: TrackRowProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onSelect}
      disabled={!onSelect}
      accessibilityRole={onSelect ? 'button' : undefined}
      accessibilityLabel={`${track.title} by ${track.artist}`}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: selected ? colors.accent : colors.border },
      ]}
    >
      {track.thumbnailUrl ? (
        <Image source={{ uri: track.thumbnailUrl }} style={styles.art} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.art, styles.artFallback, { backgroundColor: colors.elevated }]}>
          <Ionicons name="musical-notes" size={22} color={colors.muted} />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={[styles.artist, { color: colors.muted }]} numberOfLines={1}>
          {track.artist}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
          {[track.album, formatDuration(track.durationMs)].filter(Boolean).join(' · ')}
        </Text>
        <ProviderBadge provider={track.provider} />
        {confidence !== undefined ? (
          <Text style={[styles.confidence, { color: colors.cyan }]}>Match score: {confidence}/100</Text>
        ) : null}
        {actionLabel ? <Text style={[styles.confidence, { color: colors.cyan }]}>{actionLabel}</Text> : null}
      </View>
      <View style={styles.actions}>
        {onMoveUp ? (
          <IconButton accessibilityLabel="Move up" onPress={onMoveUp}>
            <Ionicons name="arrow-up" size={18} color={colors.text} />
          </IconButton>
        ) : null}
        {onMoveDown ? (
          <IconButton accessibilityLabel="Move down" onPress={onMoveDown}>
            <Ionicons name="arrow-down" size={18} color={colors.text} />
          </IconButton>
        ) : null}
        {onReplace ? (
          <IconButton accessibilityLabel="Replace song" onPress={onReplace}>
            <Ionicons name="swap-horizontal" size={18} color={colors.text} />
          </IconButton>
        ) : null}
        {onAdd ? (
          <IconButton accessibilityLabel="Add song" onPress={onAdd}>
            <Ionicons name="add" size={20} color={colors.text} />
          </IconButton>
        ) : null}
        {onRemove ? (
          <IconButton accessibilityLabel="Remove song" onPress={onRemove}>
            <Ionicons name="close" size={18} color={colors.text} />
          </IconButton>
        ) : null}
      </View>
    </Pressable>
  );
}

export { TrackRow as TrackCard };

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
  },
  art: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontWeight: '700',
    fontSize: 15,
  },
  artist: {
    fontSize: 13,
  },
  meta: {
    fontSize: 12,
  },
  confidence: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    alignItems: 'center',
    gap: 8,
  },
});
