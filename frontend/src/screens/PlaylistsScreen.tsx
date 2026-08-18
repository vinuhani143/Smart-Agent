import { router } from 'expo-router';
import { Text } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PlaylistCard } from '@/components/PlaylistCard';
import { Screen } from '@/components/Screen';
import { colors } from '@/constants/theme';
import { usePlaylists } from '@/hooks/usePlaylists';
import { toUserMessage } from '@/utils/errors';

export function PlaylistsScreen() {
  const playlists = usePlaylists();

  return (
    <Screen>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>Playlists</Text>
      {playlists.isError ? <ErrorBanner message={toUserMessage(playlists.error)} /> : null}
      {(playlists.data?.playlists ?? []).map((playlist) => (
        <PlaylistCard
          key={playlist.id}
          playlist={playlist}
          onPress={() => router.push(`/playlist/${playlist.id}`)}
        />
      ))}
      {playlists.isSuccess && playlists.data.playlists.length === 0 ? (
        <EmptyState
          title="No playlists yet"
          body="Create a playlist, generate one from a description, or convert from a connected service."
        />
      ) : null}
    </Screen>
  );
}
