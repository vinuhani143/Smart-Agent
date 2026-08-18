import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { providerMeta } from '@/constants/providers';
import { colors } from '@/constants/theme';
import type { TrackResult } from '@/types';
import { formatDuration } from '@/utils/format';

interface TrackCardProps {
  track: TrackResult;
  onAdd?: () => void;
  onRemove?: () => void;
  confidence?: number;
}

export function TrackCard({ track, onAdd, onRemove, confidence }: TrackCardProps) {
  const meta = providerMeta[track.provider];

  return (
    <View style={styles.card}>
      {track.thumbnailUrl ? (
        <Image source={{ uri: track.thumbnailUrl }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artFallback]}>
          <Ionicons name="musical-notes" size={22} color={colors.muted} />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[track.album, formatDuration(track.durationMs)].filter(Boolean).join(' · ')}
        </Text>
        {confidence !== undefined ? (
          <Text style={styles.confidence}>Match confidence: {confidence}%</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
        {onAdd ? (
          <Pressable onPress={onAdd} style={styles.round}>
            <Ionicons name="add" size={20} color={colors.text} />
          </Pressable>
        ) : null}
        {onRemove ? (
          <Pressable onPress={onRemove} style={styles.round}>
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  art: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.elevated,
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
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  artist: {
    color: colors.muted,
    fontSize: 13,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  confidence: {
    color: colors.cyan,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    alignItems: 'center',
    gap: 8,
  },
  round: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
