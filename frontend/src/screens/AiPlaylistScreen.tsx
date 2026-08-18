import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Switch } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppInput } from '@/components/AppInput';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingState } from '@/components/LoadingState';
import { ProviderSelector } from '@/components/ProviderSelector';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import { isAmazonMusicLive, isAmazonMusicReady } from '@/constants/providers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useProviders } from '@/hooks/useProviders';
import { useSearch } from '@/hooks/useSearch';
import { useToast } from '@/components/ToastProvider';
import { apiFetch } from '@/services/api';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type {
  GeneratePlaylistPayload,
  GeneratedTrack,
  PlaylistGenerationView,
  ProviderId,
  TrackResult,
} from '@/types';
import { trackKey } from '@/utils/duplicates';
import { toUserMessage } from '@/utils/errors';
import { formatDuration } from '@/utils/format';

const EXAMPLES = [
  '90s Telugu Hits',
  '2 hour Romantic',
  '60 min Workout',
  'Night Drive',
  'Relaxing Music',
  'Party',
];

const LOADING_STAGES = [
  'Understanding your request...',
  'Finding songs...',
  'Checking duplicates...',
  'Building playlist...',
  'Preparing preview...',
];

const LANGUAGES = ['Telugu', 'English', 'Hindi', 'Tamil'];
const GENRES = ['Melody', 'Pop', 'Rock', 'Evergreen'];
const MOODS = ['Romantic', 'Workout', 'Relaxing', 'Party'];

export function AiPlaylistScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const [prompt, setPrompt] = useState(
    'Create a 2 hour Telugu romantic melody playlist from 1995 to 2010 without duplicate songs.',
  );
  const [provider, setProvider] = useState<ProviderId | 'all' | 'both'>('both');
  const [destination, setDestination] = useState<ProviderId | null>(null);
  const [language, setLanguage] = useState<string | undefined>();
  const [genre, setGenre] = useState<string | undefined>();
  const [mood, setMood] = useState<string | undefined>();
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [artist, setArtist] = useState('');
  const [explicitContent, setExplicitContent] = useState<boolean | undefined>(undefined);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [view, setView] = useState<PlaylistGenerationView | null>(null);
  const [addQuery, setAddQuery] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const providers = useProviders();
  const amazonLive = isAmazonMusicLive(providers.data?.providers);
  const amazonReady = isAmazonMusicReady(providers.data?.providers);
  const debouncedAdd = useDebouncedValue(addQuery, 400);
  const addSearch = useSearch(
    debouncedAdd,
    { provider: provider === 'both' || provider === 'all' ? 'all' : provider },
    Boolean(view) && debouncedAdd.trim().length > 1,
  );

  useEffect(() => {
    if (typeof params.prompt === 'string' && params.prompt.trim()) {
      setPrompt(params.prompt);
    }
  }, [params.prompt]);

  useEffect(() => {
    if (!loading) {
      setStageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setStageIndex((index) => (index + 1) % LOADING_STAGES.length);
    }, 1400);
    return () => clearInterval(timer);
  }, [loading]);

  const tracks = view?.playlist.tracks ?? [];
  const actualMs = useMemo(
    () => tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0),
    [tracks],
  );
  const coverUrl = tracks.find((track) => track.thumbnailUrl)?.thumbnailUrl;

  function payload(): GeneratePlaylistPayload {
    const parsedFrom = yearFrom.trim() ? Number(yearFrom) : undefined;
    const parsedTo = yearTo.trim() ? Number(yearTo) : undefined;
    const parsedDuration = durationMinutes.trim() ? Number(durationMinutes) : undefined;
    const source = provider === 'all' ? 'both' : provider;
    return {
      prompt,
      provider: source,
      destinationProvider: destination ?? undefined,
      language,
      genre,
      mood,
      artist: artist.trim() || undefined,
      yearFrom: Number.isFinite(parsedFrom) ? parsedFrom : undefined,
      yearTo: Number.isFinite(parsedTo) ? parsedTo : undefined,
      durationMinutes: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
      allowDuplicates,
      explicitContent,
    };
  }

  async function generate(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<PlaylistGenerationView>('/api/ai/playlists/generate', {
        method: 'POST',
        body: JSON.stringify(payload()),
      });
      setView(result);
      setTitle(result.playlist.title);
      setDescription(result.playlist.description);
      if (!destination && result.summary.sourceProvider !== 'both') {
        const source = result.summary.sourceProvider;
        if (source === 'amazon_music') {
          setDestination(amazonReady ? 'amazon_music' : null);
        } else {
          setDestination(source === 'youtube' ? 'youtube' : 'spotify');
        }
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function persist(next: Partial<{ title: string; description: string; trackIds: string[]; addTrack: TrackResult }>): Promise<void> {
    if (!view) {
      return;
    }
    const result = await apiFetch<PlaylistGenerationView>(`/api/ai/playlists/${view.generationId}`, {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    setView(result);
    if (next.title !== undefined) {
      setTitle(result.playlist.title);
    }
    if (next.description !== undefined) {
      setDescription(result.playlist.description);
    }
  }

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tracks.length) {
      return;
    }
    const ids = tracks.map(trackKey);
    const swap = ids[index];
    const other = ids[nextIndex];
    if (!swap || !other) {
      return;
    }
    ids[index] = other;
    ids[nextIndex] = swap;
    setError(null);
    try {
      await persist({ trackIds: ids });
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function remove(track: GeneratedTrack): Promise<void> {
    setError(null);
    try {
      await persist({ trackIds: tracks.filter((item) => trackKey(item) !== trackKey(track)).map(trackKey) });
      toast.show('Song removed', 'success');
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function replace(track: GeneratedTrack): Promise<void> {
    if (!view) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<PlaylistGenerationView>(`/api/ai/playlists/${view.generationId}/replace`, {
        method: 'POST',
        body: JSON.stringify({ provider: track.provider, providerTrackId: track.providerTrackId }),
      });
      setView(result);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addSong(track: TrackResult): Promise<void> {
    setError(null);
    try {
      await persist({ addTrack: track });
      setAddQuery('');
      toast.show('Song added', 'success');
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function saveDraft(): Promise<void> {
    setError(null);
    try {
      await persist({ title: title.trim() || view?.playlist.title, description: description.trim() });
      toast.show('Playlist saved', 'success');
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function createPlaylist(): Promise<void> {
    if (!view) {
      return;
    }
    if (!destination) {
      setError(
        amazonLive
          ? 'Choose Spotify, YouTube, or Amazon Music as the destination, then confirm Create Playlist.'
          : 'Choose Spotify or YouTube as the destination, then confirm Create Playlist.',
      );
      return;
    }
    if (destination === 'amazon_music' && !amazonReady) {
      setError('Amazon Music is currently unavailable. Create on Spotify or YouTube instead.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await persist({ title: title.trim() || view.playlist.title, description: description.trim() });
      const result = await apiFetch<{ playlistId: string }>(`/api/ai/playlists/${view.generationId}/create`, {
        method: 'POST',
        body: JSON.stringify({ destinationProvider: destination }),
      });
      toast.show('Playlist created', 'success');
      router.push(`/playlist/${result.playlistId}`);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const searchProvider = provider === 'all' ? 'both' : provider;

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.text }]}>Create with AI</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Describe the playlist you want. Nothing is created until you tap Create Playlist.</Text>
      <AppInput
        label="Playlist prompt"
        placeholder="Create a 2 hour Telugu romantic melody playlist from 1995 to 2010 without duplicate songs."
        value={prompt}
        onChangeText={setPrompt}
        multiline
        accessibilityLabel="Describe the playlist you want"
      />

      <Text style={[styles.section, { color: colors.text }]}>Examples</Text>
      <View style={styles.wrapRow}>
        {EXAMPLES.map((example) => (
          <Chip key={example} label={example} active={prompt === example} onPress={() => setPrompt(example)} />
        ))}
      </View>

      <Pressable
        onPress={() => setFiltersOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: filtersOpen }}
        accessibilityLabel="Advanced filters"
        style={styles.filterToggle}
      >
        <Text style={[styles.section, { color: colors.text, marginTop: 0 }]}>Advanced filters</Text>
        <Text style={{ color: colors.muted }}>{filtersOpen ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {filtersOpen ? (
        <View style={styles.filters}>
          <Text style={[styles.hint, { color: colors.muted }]}>Language</Text>
          <View style={styles.wrapRow}>
            {LANGUAGES.map((item) => (
              <Chip key={item} label={item} active={language === item} onPress={() => setLanguage(language === item ? undefined : item)} />
            ))}
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>Genre</Text>
          <View style={styles.wrapRow}>
            {GENRES.map((item) => (
              <Chip key={item} label={item} active={genre === item} onPress={() => setGenre(genre === item ? undefined : item)} />
            ))}
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>Mood</Text>
          <View style={styles.wrapRow}>
            {MOODS.map((item) => (
              <Chip key={item} label={item} active={mood === item} onPress={() => setMood(mood === item ? undefined : item)} />
            ))}
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppInput label="Year from" value={yearFrom} onChangeText={setYearFrom} keyboardType="number-pad" />
            </View>
            <View style={styles.flex}>
              <AppInput label="Year to" value={yearTo} onChangeText={setYearTo} keyboardType="number-pad" />
            </View>
          </View>
          <AppInput label="Duration (minutes)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
          <AppInput label="Artist" value={artist} onChangeText={setArtist} />
          <Text style={[styles.hint, { color: colors.muted }]}>Explicit content</Text>
          <View style={styles.wrapRow}>
            <Chip label="No filter" active={explicitContent === undefined} onPress={() => setExplicitContent(undefined)} />
            <Chip label="Filter explicit" active={explicitContent === false} onPress={() => setExplicitContent(false)} />
            <Chip label="Allow explicit" active={explicitContent === true} onPress={() => setExplicitContent(true)} />
          </View>
          <View style={styles.switchRow}>
            <Text style={[styles.hint, { color: colors.muted }]}>Allow duplicate songs</Text>
            <Switch value={allowDuplicates} onValueChange={setAllowDuplicates} />
          </View>
        </View>
      ) : null}

      <Text style={[styles.section, { color: colors.text }]}>Search on</Text>
      <ProviderSelector value={searchProvider} onChange={setProvider} providers={providers.data?.providers} includeBoth />

      <Text style={[styles.section, { color: colors.text }]}>Create on</Text>
      <ProviderSelector
        value={destination ?? 'all'}
        onChange={(value) => {
          if (value === 'all' || value === 'both') {
            return;
          }
          setDestination(value);
        }}
        providers={providers.data?.providers}
        requireConnected
      />
      {!destination ? (
        <Text style={[styles.hint, { color: colors.muted }]}>Choose a destination before creating. Generation never creates a playlist on a music service.</Text>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState label={LOADING_STAGES[stageIndex]} /> : null}

      <AppButton
        label={view ? 'Regenerate' : 'Generate Playlist'}
        onPress={() => void generate()}
        loading={loading}
        disabled={loading || prompt.trim().length < 3}
      />

      {view ? (
        <AppCard>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.cover} accessibilityIgnoresInvertColors accessibilityLabel="Playlist cover" />
          ) : (
            <View style={[styles.cover, styles.coverFallback, { backgroundColor: colors.elevated }]}>
              <Text style={{ fontSize: 36 }}>🤖</Text>
            </View>
          )}
          <AppInput label="Generated title" value={title} onChangeText={setTitle} />
          <AppInput label="Description" value={description} onChangeText={setDescription} multiline />
          <Text style={[styles.meta, { color: colors.cyan }]}>
            {view.summary.trackCount} tracks · {formatDuration(actualMs)} · {view.summary.destinationProvider ?? destination ?? 'choose a service'}
          </Text>
          {view.summary.warning ? <Text style={[styles.warning, { color: colors.warning }]}>{view.summary.warning}</Text> : null}
          {view.summary.orderingNote ? <Text style={[styles.hint, { color: colors.muted }]}>{view.summary.orderingNote}</Text> : null}
        </AppCard>
      ) : (
        <EmptyState
          title="Preview first"
          body="MusicMix searches connected catalogs for real songs. Nothing is created until you review and tap Create Playlist."
        />
      )}

      {tracks.map((track, index) => (
        <TrackRow
          key={trackKey(track)}
          track={track}
          confidence={track.trackScore}
          actionLabel={
            track.metadataFlags?.explicit === 'unknown' && explicitContent === false
              ? 'Explicit status unknown — not claimed clean'
              : undefined
          }
          onRemove={() => void remove(track)}
          onReplace={() => void replace(track)}
          onMoveUp={index > 0 ? () => void move(index, -1) : undefined}
          onMoveDown={index < tracks.length - 1 ? () => void move(index, 1) : undefined}
        />
      ))}

      {view ? (
        <>
          <Text style={[styles.section, { color: colors.text }]}>Search replacement</Text>
          <AppInput
            label="Search connected catalogs"
            value={addQuery}
            onChangeText={setAddQuery}
            placeholder="Search songs, artists & albums"
            autoCorrect={false}
            returnKeyType="search"
          />
          {addSearch.isFetching ? <LoadingState label="Searching catalogs" /> : null}
          {(addSearch.data?.tracks ?? []).map((track) => (
            <TrackRow key={trackKey(track)} track={track} onAdd={() => void addSong(track)} />
          ))}
          <AppButton label="Save" variant="secondary" onPress={() => void saveDraft()} disabled={loading} />
          <AppButton
            label="Create Playlist"
            onPress={() => void createPlaylist()}
            loading={loading}
            disabled={!view || tracks.length === 0 || loading}
            accessibilityHint="Creates the playlist on the selected music service"
          />
          <Text style={[styles.hint, { color: colors.muted }]}>
            Create Playlist runs only after this confirmation. Generation never creates a playlist on Spotify, YouTube, or Amazon Music.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  hint: {
    fontSize: 13,
  },
  meta: {
    fontSize: 13,
    fontWeight: '600',
  },
  warning: {
    fontSize: 13,
    fontWeight: '600',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  filters: {
    gap: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  cover: {
    width: '100%',
    height: 160,
    borderRadius: 16,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
