import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Screen } from '@/components/Screen';
import { SkeletonBlock } from '@/components/LoadingState';
import { TrackRow } from '@/components/TrackRow';
import { AppInput } from '@/components/AppInput';
import { isAmazonMusicLive } from '@/constants/providers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useProviders } from '@/hooks/useProviders';
import { useInfiniteSearch } from '@/hooks/useSearch';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { SearchFilters, TrackResult } from '@/types';
import { trackKey } from '@/utils/duplicates';
import { toUserMessage } from '@/utils/errors';

type Scope = NonNullable<SearchFilters['provider']>;

function SearchSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <SkeletonBlock width={56} height={56} />
          <View style={styles.skeletonCopy}>
            <SkeletonBlock height={16} width="70%" />
            <SkeletonBlock height={12} width="45%" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function SearchScreen() {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const debounced = useDebouncedValue(query, 400);
  const providers = useProviders();
  const amazonLive = isAmazonMusicLive(providers.data?.providers);
  const searchQuery = debounced.trim();
  const filters: SearchFilters = { provider: scope };
  const search = useInfiniteSearch(searchQuery, filters, searchQuery.length >= 2);

  const tracks = useMemo(() => {
    const pages = search.data?.pages ?? [];
    const seen = new Set<string>();
    const out: TrackResult[] = [];
    for (const page of pages) {
      for (const track of page.tracks) {
        const key = trackKey(track);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(track);
      }
    }
    return out;
  }, [search.data]);

  const onEnd = useCallback(() => {
    if (search.hasNextPage && !search.isFetchingNextPage) {
      void search.fetchNextPage();
    }
  }, [search]);

  const chips: { id: Scope; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'spotify', label: 'Spotify' },
    { id: 'youtube', label: 'YouTube' },
    ...(amazonLive ? [{ id: 'amazon_music' as const, label: 'Amazon Music' }] : []),
  ];

  let body: ReactElement;
  if (searchQuery.length < 2) {
    body = (
      <EmptyState
        title="Start typing"
        body="Search songs, artists, and albums. Results appear after you pause typing."
      />
    );
  } else if (search.isError) {
    body = (
      <ErrorState
        title="Search failed"
        message={toUserMessage(search.error)}
        onRetry={() => void search.refetch()}
      />
    );
  } else if (search.isFetching && tracks.length === 0) {
    body = <SearchSkeleton />;
  } else if (tracks.length === 0) {
    body = (
      <EmptyState
        title="No matching songs found"
        body="Try a different title, artist, or music service."
        actionLabel="Clear search"
        onAction={() => setQuery('')}
      />
    );
  } else {
    body = (
      <FlatList
        data={tracks}
        keyExtractor={(item) => trackKey(item)}
        renderItem={({ item }) => <TrackRow track={item} />}
        onEndReached={onEnd}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListFooterComponent={
          search.isFetchingNextPage ? (
            <Text style={{ color: colors.muted, textAlign: 'center', padding: 16 }}>Loading more…</Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    );
  }

  return (
    <Screen scroll={false} contentStyle={{ gap: 12 }}>
      <Text style={[styles.title, { color: colors.text }]}>Search</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Find songs across your connected services.</Text>
      <AppInput
        label="Search"
        placeholder="Search songs, artists & albums"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search songs, artists and albums"
      />
      <View style={styles.chips}>
        {chips.map((chip) => (
          <Chip key={chip.id} label={chip.label} active={scope === chip.id} onPress={() => setScope(chip.id)} />
        ))}
      </View>
      <View style={styles.results}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  results: {
    flex: 1,
  },
  skeletonList: {
    gap: 10,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
});
