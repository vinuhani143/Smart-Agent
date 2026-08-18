import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { PlaylistCard } from '@/components/PlaylistCard';
import { Screen } from '@/components/Screen';
import { isAmazonMusicLive } from '@/constants/providers';
import { useDeletePlaylist, usePlaylists } from '@/hooks/usePlaylists';
import { useProviders } from '@/hooks/useProviders';
import { useToast } from '@/components/ToastProvider';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { PlaylistSummary } from '@/types';
import { toUserMessage } from '@/utils/errors';
import { filterPlaylists, type PlaylistLibraryFilter } from '@/utils/playlistFilters';

const FILTERS: { id: PlaylistLibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'amazon_music', label: 'Amazon Music' },
  { id: 'created_by_me', label: 'Created by Me' },
  { id: 'ai_generated', label: 'AI Generated' },
];

export function PlaylistsScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const playlists = usePlaylists();
  const providers = useProviders();
  const remove = useDeletePlaylist();
  const [filter, setFilter] = useState<PlaylistLibraryFilter>('all');
  const [pendingDelete, setPendingDelete] = useState<PlaylistSummary | null>(null);
  const amazonLive = isAmazonMusicLive(providers.data?.providers);
  const visible = useMemo(
    () => filterPlaylists(playlists.data?.playlists ?? [], filter),
    [playlists.data, filter],
  );

  function emptyCopy(): { title: string; body: string; actionLabel?: string; href?: string } {
    if (filter === 'amazon_music' && !amazonLive) {
      return {
        title: "Amazon Music isn't available yet",
        body: 'Amazon Music needs official API access. Connect Spotify or YouTube to keep building playlists.',
        actionLabel: 'Go to Settings',
        href: '/(tabs)/settings',
      };
    }
    if (filter === 'spotify') {
      return {
        title: 'Connect Spotify to see your playlists',
        body: 'Playlists you create or convert to Spotify will show up here.',
        actionLabel: 'Connect services',
        href: '/(tabs)/settings',
      };
    }
    if (filter === 'youtube') {
      return {
        title: 'Connect YouTube to see your playlists',
        body: 'Playlists you create or convert to YouTube will show up here.',
        actionLabel: 'Connect services',
        href: '/(tabs)/settings',
      };
    }
    if (filter === 'ai_generated') {
      return {
        title: 'No AI playlists yet',
        body: 'Describe a mood or era and let MusicMix find real songs.',
        actionLabel: 'Create with AI',
        href: '/ai-playlist',
      };
    }
    return {
      title: 'No playlists yet',
      body: 'Create a playlist, generate one from a description, or convert from a connected service.',
      actionLabel: 'Create',
      href: '/(tabs)/create',
    };
  }

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.text }]}>My Playlists</Text>
      <View style={styles.chips}>
        {FILTERS.map((item) => (
          <Chip key={item.id} label={item.label} active={filter === item.id} onPress={() => setFilter(item.id)} />
        ))}
      </View>
      {playlists.isLoading ? <LoadingState label="Loading playlists" /> : null}
      {playlists.isError ? (
        <ErrorState message={toUserMessage(playlists.error)} onRetry={() => void playlists.refetch()} />
      ) : null}
      {visible.map((playlist) => (
        <PlaylistCard
          key={playlist.id}
          playlist={playlist}
          onPress={() => router.push(`/playlist/${playlist.id}`)}
          onEdit={() => router.push(`/playlist/${playlist.id}`)}
          onConvert={() => router.push('/convert')}
          onDelete={() => setPendingDelete(playlist)}
        />
      ))}
      {playlists.isSuccess && visible.length === 0 ? (
        <EmptyState
          title={emptyCopy().title}
          body={emptyCopy().body}
          actionLabel={emptyCopy().actionLabel}
          onAction={() => {
            const href = emptyCopy().href;
            if (href) {
              router.push(href as Href);
            }
          }}
        />
      ) : null}
      <ConfirmDialog
        visible={Boolean(pendingDelete)}
        title="Delete playlist"
        message="This removes the MusicMix playlist, not the copy on Spotify, YouTube, or Amazon Music."
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) {
            return;
          }
          const id = pendingDelete.id;
          setPendingDelete(null);
          void remove.mutateAsync(id).then(() => toast.show('Playlist deleted', 'success'));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
