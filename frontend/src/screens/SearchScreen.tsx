import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FilterBar } from '@/components/FilterBar';
import { Screen } from '@/components/Screen';
import { TrackCard } from '@/components/TrackCard';
import { colors } from '@/constants/theme';
import { useAddTrack, usePlaylists } from '@/hooks/usePlaylists';
import { useSearch } from '@/hooks/useSearch';
import { useProviders } from '@/hooks/useProviders';
import { useUiStore } from '@/store/uiStore';
import { isAmazonMusicLive } from '@/constants/providers';
import type { SearchFilters, TrackResult } from '@/types';
import { toUserMessage } from '@/utils/errors';

const BASE_PROVIDERS: Array<NonNullable<SearchFilters['provider']>> = ['all', 'spotify', 'youtube'];

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [pendingTrack, setPendingTrack] = useState<TrackResult | null>(null);
  const filters = useUiStore((state) => state.filters);
  const setFilters = useUiStore((state) => state.setFilters);
  const addTargetPlaylistId = useUiStore((state) => state.addTargetPlaylistId);
  const search = useSearch(submitted, filters, submitted.length > 0);
  const playlists = usePlaylists();
  const addTrack = useAddTrack();
  const providers = useProviders();
  const amazonLive = isAmazonMusicLive(providers.data?.providers);
  const providerChips: Array<NonNullable<SearchFilters['provider']>> = amazonLive
    ? [...BASE_PROVIDERS, 'amazon_music']
    : BASE_PROVIDERS;

  async function addToPlaylist(playlistId: string, track: TrackResult): Promise<void> {
    await addTrack.mutateAsync({ playlistId, track });
    setPendingTrack(null);
  }

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
        <Text style={styles.filtersLabel}>Provider</Text>
        <View style={styles.providerRow}>
          {providerChips.map((provider) => (
            <Pressable
              key={provider}
              onPress={() => setFilters({ ...filters, provider })}
              style={[styles.chip, (filters.provider ?? 'all') === provider && styles.chipActive]}
            >
              <Text style={[styles.chipText, (filters.provider ?? 'all') === provider && styles.chipTextActive]}>
                {provider === 'all'
                  ? 'All'
                  : provider === 'youtube'
                    ? 'YouTube'
                    : provider === 'amazon_music'
                      ? 'Amazon Music'
                      : 'Spotify'}
              </Text>
            </Pressable>
          ))}
          {!amazonLive ? (
            <Pressable disabled style={[styles.chip, styles.chipDisabled]}>
              <Text style={styles.chipText}>Amazon Music — Coming Soon</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.filtersLabel}>Filters</Text>
        <FilterBar filters={filters} onChange={setFilters} />
      </View>
      {search.isError ? <ErrorBanner message={toUserMessage(search.error)} /> : null}
      {addTrack.isError ? <ErrorBanner message={toUserMessage(addTrack.error)} /> : null}
      {search.isSuccess && search.data.tracks.length === 0 ? (
        <EmptyState title="No search results" body="Try another title, artist, or fewer filters." />
      ) : null}
      {(search.data?.tracks ?? []).map((track) => (
        <TrackCard
          key={`${track.provider}:${track.providerTrackId}`}
          track={track}
          onAdd={() => {
            if (addTargetPlaylistId) {
              void addToPlaylist(addTargetPlaylistId, track);
              return;
            }
            setPendingTrack(track);
          }}
        />
      ))}
      {pendingTrack ? (
        <View style={styles.picker}>
          <Text style={styles.pickerTitle}>Add to a playlist</Text>
          {(playlists.data?.playlists ?? []).map((playlist) => (
            <Pressable
              key={playlist.id}
              style={styles.pickerItem}
              onPress={() => void addToPlaylist(playlist.id, pendingTrack)}
            >
              <Text style={styles.chipTextActive}>{playlist.name}</Text>
            </Pressable>
          ))}
          {(playlists.data?.playlists ?? []).length === 0 ? (
            <Text style={styles.filtersLabel}>Create a playlist first, then add songs.</Text>
          ) : null}
          <Pressable onPress={() => setPendingTrack(null)}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {!submitted ? (
        <EmptyState
          title="Find a song"
          body="Connect Spotify or YouTube in Settings, then search. Amazon Music stays unavailable until Amazon approves official API access."
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
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  picker: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  pickerTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  pickerItem: {
    paddingVertical: 8,
  },
  cancel: {
    color: colors.cyan,
    fontWeight: '600',
  },
});
