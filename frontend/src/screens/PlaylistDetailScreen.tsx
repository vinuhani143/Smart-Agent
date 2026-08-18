import { useLocalSearchParams, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { Artwork } from '@/components/Artwork';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { useDeletePlaylist, usePlaylist, useRemoveTrack, useUpdatePlaylist } from '@/hooks/usePlaylists';
import { useToast } from '@/components/ToastProvider';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { formatDuration, formatTrackCount } from '@/utils/format';
import { toUserMessage } from '@/utils/errors';

export function PlaylistDetailScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistQuery = usePlaylist(id);
  const remove = useDeletePlaylist();
  const update = useUpdatePlaylist();
  const removeTrack = useRemoveTrack();
  const playlist = playlistQuery.data?.playlist;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);

  return (
    <Screen>
      {playlistQuery.isLoading ? <LoadingState label="Loading playlist" /> : null}
      {playlistQuery.isError ? (
        <ErrorState message={toUserMessage(playlistQuery.error)} onRetry={() => void playlistQuery.refetch()} />
      ) : null}
      {playlist ? (
        <>
          <Artwork uri={playlist.coverImageUrl} style={styles.cover} accessibilityLabel={`${playlist.name} cover`} />
          {editing ? (
            <>
              <AppInput label="Name" value={name} onChangeText={setName} />
              <AppInput label="Description" value={description} onChangeText={setDescription} multiline />
              <AppButton
                label="Save"
                onPress={() => {
                  if (!id) {
                    return;
                  }
                  void update.mutateAsync({ playlistId: id, name: name.trim(), description: description.trim() }).then(() => {
                    setEditing(false);
                    toast.show('Playlist saved', 'success');
                  });
                }}
                loading={update.isPending}
              />
            </>
          ) : (
            <>
              <Text style={[styles.name, { color: colors.text }]}>{playlist.name}</Text>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {formatTrackCount(playlist.trackCount)} · {formatDuration(playlist.totalDurationMs)}
              </Text>
              {playlist.description ? <Text style={[styles.description, { color: colors.muted }]}>{playlist.description}</Text> : null}
            </>
          )}

          <View style={styles.actions}>
            <AppButton
              label="Play"
              onPress={() => {
                toast.show(
                  playlist.sourcePlaylistId
                    ? 'Open this playlist on the official music service. MusicMix does not stream audio.'
                    : 'Create this playlist on a music service first, then you can open it there.',
                  'info',
                );
              }}
            />
            <AppButton
              label="Edit"
              variant="secondary"
              onPress={() => {
                setName(playlist.name);
                setDescription(playlist.description ?? '');
                setEditing(true);
              }}
            />
            <AppButton label="Convert" variant="secondary" onPress={() => router.push('/convert')} />
            <AppButton label="Delete" variant="danger" onPress={() => setConfirmDelete(true)} />
          </View>

          {(playlist.tracks ?? []).map((track) => (
            <View key={track.id} style={[styles.trackRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.trackTitle, { color: colors.text }]}>{track.title}</Text>
                <Text style={[styles.trackArtist, { color: colors.muted }]}>
                  {track.artist} · {formatDuration(track.durationMs)}
                </Text>
              </View>
              <AppButton label="Remove" variant="ghost" onPress={() => setPendingTrackId(track.id)} />
            </View>
          ))}
          {(playlist.tracks ?? []).length === 0 ? (
            <EmptyState
              title="No songs yet"
              body="Add songs from Search or rebuild this playlist with AI."
              actionLabel="Search songs"
              onAction={() => router.push('/(tabs)/search')}
            />
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete playlist"
        message="This removes the MusicMix playlist, not the copy on Spotify, YouTube, or Amazon Music."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          if (id) {
            void remove.mutateAsync(id).then(() => router.replace('/(tabs)/playlists'));
          }
        }}
      />
      <ConfirmDialog
        visible={Boolean(pendingTrackId)}
        title="Remove song"
        message="Remove this song from the MusicMix playlist?"
        confirmLabel="Remove"
        danger
        onCancel={() => setPendingTrackId(null)}
        onConfirm={() => {
          if (id && pendingTrackId) {
            const trackId = pendingTrackId;
            setPendingTrackId(null);
            void removeTrack.mutateAsync({ playlistId: id, trackId }).then(() => toast.show('Song removed', 'success'));
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    height: 220,
    borderRadius: 24,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
  },
  meta: {
    fontSize: 14,
  },
  description: {
    lineHeight: 20,
  },
  actions: {
    gap: 8,
  },
  trackRow: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  trackTitle: {
    fontWeight: '700',
  },
  trackArtist: {
    marginTop: 2,
  },
});
