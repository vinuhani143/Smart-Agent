import { useLocalSearchParams, router } from 'expo-router';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { colors } from '@/constants/theme';
import { useDeletePlaylist, usePlaylist } from '@/hooks/usePlaylists';
import { useUiStore } from '@/store/uiStore';
import { formatDuration, formatTrackCount } from '@/utils/format';
import { toUserMessage } from '@/utils/errors';

export function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistQuery = usePlaylist(id);
  const remove = useDeletePlaylist();
  const setAddTargetPlaylistId = useUiStore((state) => state.setAddTargetPlaylistId);
  const playlist = playlistQuery.data?.playlist;

  return (
    <Screen>
      {playlistQuery.isError ? <ErrorBanner message={toUserMessage(playlistQuery.error)} /> : null}
      {playlist ? (
        <>
          {playlist.coverImageUrl ? (
            <Image source={{ uri: playlist.coverImageUrl }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverFallback]}>
              <Ionicons name="albums" size={48} color={colors.accent} />
            </View>
          )}
          <Text style={styles.name}>{playlist.name}</Text>
          <Text style={styles.meta}>
            {formatTrackCount(playlist.trackCount)} · {formatDuration(playlist.totalDurationMs)}
          </Text>
          {playlist.description ? <Text style={styles.description}>{playlist.description}</Text> : null}

          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={() => {
                if (!playlist.sourcePlaylistId) {
                  Alert.alert(
                    'Not on a music service yet',
                    'Create this playlist on Spotify, YouTube, or Amazon Music first, then you can open it there.',
                  );
                  return;
                }
                Alert.alert('Play', 'MusicMix opens playlists on the official service. It does not stream or download audio itself.');
              }}
            >
              Play
            </Button>
            <Button
              mode="outlined"
              onPress={() => {
                if (id) {
                  setAddTargetPlaylistId(id);
                  router.push('/(tabs)/search');
                }
              }}
            >
              Add Songs
            </Button>
            <Button mode="outlined" onPress={() => router.push('/convert')}>
              Convert
            </Button>
            <Button
              mode="outlined"
              textColor={colors.danger}
              onPress={() => {
                Alert.alert('Delete playlist', 'This removes the MusicMix playlist, not the copy on Spotify, YouTube, or Amazon Music.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      if (id) {
                        void remove.mutateAsync(id).then(() => router.replace('/(tabs)/playlists'));
                      }
                    },
                  },
                ]);
              }}
            >
              Delete
            </Button>
          </View>

          {(playlist.tracks ?? []).map((track) => (
            <View key={track.id} style={styles.trackRow}>
              <Text style={styles.trackTitle}>{track.title}</Text>
              <Text style={styles.trackArtist}>
                {track.artist} · {formatDuration(track.durationMs)}
              </Text>
            </View>
          ))}
        </>
      ) : playlistQuery.isLoading ? (
        <EmptyState title="Loading" body="Fetching playlist…" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    height: 220,
    borderRadius: 24,
    backgroundColor: colors.card,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
  },
  description: {
    color: colors.muted,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trackRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  trackArtist: {
    color: colors.muted,
    marginTop: 2,
  },
});
