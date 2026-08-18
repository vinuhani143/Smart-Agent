import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Searchbar } from 'react-native-paper';
import { router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingState } from '@/components/LoadingState';
import { ProviderSelector } from '@/components/ProviderSelector';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCreatePlaylist } from '@/hooks/usePlaylists';
import { useProviders } from '@/hooks/useProviders';
import { useSearch } from '@/hooks/useSearch';
import { useToast } from '@/components/ToastProvider';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { ProviderId, TrackResult } from '@/types';
import { isDuplicateTrack, trackKey } from '@/utils/duplicates';
import { formatDuration } from '@/utils/format';
import { toUserMessage } from '@/utils/errors';

export function CreatePlaylistScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<ProviderId | 'all' | 'both'>('spotify');
  const [tracks, setTracks] = useState<TrackResult[]>([]);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 400);
  const create = useCreatePlaylist();
  const providers = useProviders();
  const search = useSearch(debounced, { provider: provider === 'both' ? 'all' : provider }, debounced.trim().length > 1);
  const selected = providers.data?.providers.find((item) => item.id === provider);
  const totalMs = useMemo(
    () => tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0),
    [tracks],
  );

  function addTrack(track: TrackResult): void {
    if (isDuplicateTrack(tracks, track)) {
      toast.show('That song is already in this playlist', 'info');
      return;
    }
    setTracks((current) => [...current, track]);
    toast.show('Song added', 'success');
  }

  function move(index: number, direction: -1 | 1): void {
    const next = index + direction;
    if (next < 0 || next >= tracks.length) {
      return;
    }
    setTracks((current) => {
      const copy = [...current];
      const swap = copy[index];
      const other = copy[next];
      if (!swap || !other) {
        return current;
      }
      copy[index] = other;
      copy[next] = swap;
      return copy;
    });
  }

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.text }]}>Custom playlist</Text>
      <AppInput label="Name" value={name} onChangeText={setName} />
      <AppInput label="Description" value={description} onChangeText={setDescription} multiline />
      <Text style={[styles.section, { color: colors.text }]}>Provider</Text>
      <ProviderSelector
        value={provider}
        onChange={setProvider}
        providers={providers.data?.providers}
        requireConnected
      />
      {selected && !selected.connected ? (
        <ErrorBanner message={`Connect ${selected.name} in Settings before creating a playlist there.`} />
      ) : null}

      <Text style={[styles.meta, { color: colors.cyan }]}>
        {tracks.length} songs · {formatDuration(totalMs)}
      </Text>

      <Text style={[styles.section, { color: colors.text }]}>Add songs</Text>
      <Searchbar
        placeholder="Search songs, artists & albums"
        value={query}
        onChangeText={setQuery}
        style={{ backgroundColor: colors.card }}
        inputStyle={{ color: colors.text }}
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search songs to add"
      />
      {search.isFetching ? <LoadingState label="Searching catalogs" /> : null}
      {search.isError ? <ErrorBanner message={toUserMessage(search.error)} /> : null}
      {(search.data?.tracks ?? []).map((track) => (
        <TrackRow key={trackKey(track)} track={track} onAdd={() => addTrack(track)} />
      ))}
      {search.isSuccess && (search.data?.tracks.length ?? 0) === 0 ? (
        <EmptyState title="No matching songs found" body="Try another title or artist." />
      ) : null}

      {tracks.map((track, index) => (
        <TrackRow
          key={trackKey(track)}
          track={track}
          onRemove={() => {
            setTracks((current) => current.filter((item) => trackKey(item) !== trackKey(track)));
            toast.show('Song removed', 'success');
          }}
          onMoveUp={index > 0 ? () => move(index, -1) : undefined}
          onMoveDown={index < tracks.length - 1 ? () => move(index, 1) : undefined}
        />
      ))}

      {create.isError ? <ErrorBanner message={toUserMessage(create.error)} /> : null}
      <AppButton
        label="Create Playlist"
        loading={create.isPending}
        disabled={!name.trim() || create.isPending || (typeof provider === 'string' && provider !== 'all' && provider !== 'both' && selected?.connected === false)}
        onPress={() => {
          if (provider === 'all' || provider === 'both') {
            return;
          }
          void create
            .mutateAsync({
              name: name.trim(),
              description: description.trim() || undefined,
              targetProvider: provider,
              tracks,
            })
            .then((result) => {
              toast.show('Playlist created', 'success');
              router.push(`/playlist/${result.playlist.id}`);
            })
            .catch((error: unknown) => {
              toast.show(toUserMessage(error), 'error');
            });
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
  section: {
    fontWeight: '700',
    fontSize: 16,
  },
  meta: {
    fontSize: 14,
    fontWeight: '600',
  },
});
