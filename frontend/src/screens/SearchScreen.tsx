import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FilterBar } from '@/components/FilterBar';
import { Screen } from '@/components/Screen';
import { TrackCard } from '@/components/TrackCard';
import { colors } from '@/constants/theme';
import { useAddTrack } from '@/hooks/usePlaylists';
import { useSearch } from '@/hooks/useSearch';
import { useUiStore } from '@/store/uiStore';
import { toUserMessage } from '@/utils/errors';

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const filters = useUiStore((state) => state.filters);
  const setFilters = useUiStore((state) => state.setFilters);
  const addTargetPlaylistId = useUiStore((state) => state.addTargetPlaylistId);
  const search = useSearch(submitted, filters, submitted.length > 0);
  const addTrack = useAddTrack();

  return (
    <Screen>
      <Text style={styles.title}>Search</Text>
      <Searchbar
        placeholder="Search songs, artists or albums"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => setSubmitted(query.trim())}
        onIconPress={() => setSubmitted(query.trim())}
        style={styles.search}
        inputStyle={{ color: colors.text }}
        placeholderTextColor={colors.muted}
      />
      <View>
        <Text style={styles.filtersLabel}>Filters</Text>
        <FilterBar filters={filters} onChange={setFilters} />
      </View>
      {search.isError ? <ErrorBanner message={toUserMessage(search.error)} /> : null}
      {search.isSuccess && search.data.tracks.length === 0 ? (
        <EmptyState title="No search results" body="Try another title, artist, or fewer filters." />
      ) : null}
      {(search.data?.tracks ?? []).map((track) => (
        <TrackCard
          key={`${track.provider}:${track.providerTrackId}`}
          track={track}
          onAdd={
            addTargetPlaylistId
              ? () =>
                  void addTrack.mutateAsync({
                    playlistId: addTargetPlaylistId,
                    track,
                  })
              : undefined
          }
        />
      ))}
      {!submitted ? (
        <EmptyState
          title="Find a song"
          body="Connect Spotify or YouTube in Settings, then search. Results come from official APIs only."
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  search: {
    backgroundColor: colors.card,
    borderRadius: 16,
  },
  filtersLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
