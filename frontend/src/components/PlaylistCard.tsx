import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import type { PlaylistSummary } from '@/types';
import { formatDuration, formatTrackCount } from '@/utils/format';

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  onPress: () => void;
}

export function PlaylistCard({ playlist, onPress }: PlaylistCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {playlist.coverImageUrl ? (
        <Image source={{ uri: playlist.coverImageUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="albums" size={28} color={colors.accent} />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.meta}>
          {formatTrackCount(playlist.trackCount)} · {formatDuration(playlist.totalDurationMs)}
        </Text>
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
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.elevated,
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
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
});
