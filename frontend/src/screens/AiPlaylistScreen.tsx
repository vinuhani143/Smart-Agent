import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Switch, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { TrackCard } from '@/components/TrackCard';
import { colors } from '@/constants/theme';
import { apiFetch } from '@/services/api';
import type {
  GeneratePlaylistPayload,
  GeneratedTrack,
  PlaylistGenerationView,
  TrackResult,
} from '@/types';
import { formatDuration } from '@/utils/format';
import { toUserMessage } from '@/utils/errors';

const EXAMPLES = [
  '90s Telugu Hits',
  '2 hour Romantic',
  '60 min Workout',
  'Night Drive',
  'Relaxing Music',
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

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function trackId(track: TrackResult): string {
  return `${track.provider}:${track.providerTrackId}`;
}

export function AiPlaylistScreen() {
  const [prompt, setPrompt] = useState(
    'Create a 2 hour Telugu romantic melody playlist from 1995 to 2010 without duplicate songs.',
  );
  const [provider, setProvider] = useState<'spotify' | 'youtube' | 'both'>('both');
  const [destination, setDestination] = useState<'spotify' | 'youtube' | null>(null);
  const [language, setLanguage] = useState<string | undefined>();
  const [genre, setGenre] = useState<string | undefined>();
  const [mood, setMood] = useState<string | undefined>();
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [artist, setArtist] = useState('');
  const [explicitContent, setExplicitContent] = useState<boolean | undefined>(undefined);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [view, setView] = useState<PlaylistGenerationView | null>(null);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<TrackResult[]>([]);
  const [adding, setAdding] = useState(false);

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

  function payload(): GeneratePlaylistPayload {
    const parsedFrom = yearFrom.trim() ? Number(yearFrom) : undefined;
    const parsedTo = yearTo.trim() ? Number(yearTo) : undefined;
    const parsedDuration = durationMinutes.trim() ? Number(durationMinutes) : undefined;
    return {
      prompt,
      provider,
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
    setAddResults([]);
    try {
      const result = await apiFetch<PlaylistGenerationView>('/api/ai/playlists/generate', {
        method: 'POST',
        body: JSON.stringify(payload()),
      });
      setView(result);
      if (!destination && result.summary.sourceProvider !== 'both') {
        setDestination(result.summary.sourceProvider === 'youtube' ? 'youtube' : 'spotify');
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
  }

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tracks.length) {
      return;
    }
    const ids = tracks.map(trackId);
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
      await persist({ trackIds: tracks.filter((item) => trackId(item) !== trackId(track)).map(trackId) });
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

  async function searchToAdd(): Promise<void> {
    const q = addQuery.trim();
    if (!q) {
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const path =
        provider === 'both'
          ? `/api/search?q=${encodeURIComponent(q)}`
          : `/api/search/${provider}?q=${encodeURIComponent(q)}`;
      const result = await apiFetch<{ tracks: TrackResult[] }>(path);
      setAddResults(result.tracks);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function addSong(track: TrackResult): Promise<void> {
    setError(null);
    try {
      await persist({ addTrack: track });
      setAddResults((current) => current.filter((item) => trackId(item) !== trackId(track)));
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function createPlaylist(): Promise<void> {
    if (!view) {
      return;
    }
    if (!destination) {
      setError('Choose Spotify or YouTube as the destination, then confirm Create Playlist.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ playlistId: string }>(`/api/ai/playlists/${view.generationId}/create`, {
        method: 'POST',
        body: JSON.stringify({ destinationProvider: destination }),
      });
      router.push(`/playlist/${result.playlistId}`);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>AI Playlist</Text>
      <Text style={styles.subtitle}>Describe the playlist you want</Text>
      <TextInput
        label="Describe the playlist you want"
        placeholder="Create a 2 hour Telugu romantic melody playlist from 1995 to 2010 without duplicate songs."
        value={prompt}
        onChangeText={setPrompt}
        multiline
        style={styles.input}
      />

      <Text style={styles.section}>Quick examples</Text>
      <View style={styles.wrapRow}>
        {EXAMPLES.map((example) => (
          <Chip key={example} label={example} active={prompt === example} onPress={() => setPrompt(example)} />
        ))}
      </View>

      <Text style={styles.section}>Advanced filters</Text>
      <Text style={styles.hint}>Language</Text>
      <View style={styles.wrapRow}>
        {LANGUAGES.map((item) => (
          <Chip
            key={item}
            label={item}
            active={language === item}
            onPress={() => setLanguage(language === item ? undefined : item)}
          />
        ))}
      </View>
      <Text style={styles.hint}>Genre</Text>
      <View style={styles.wrapRow}>
        {GENRES.map((item) => (
          <Chip
            key={item}
            label={item}
            active={genre === item}
            onPress={() => setGenre(genre === item ? undefined : item)}
          />
        ))}
      </View>
      <Text style={styles.hint}>Mood</Text>
      <View style={styles.wrapRow}>
        {MOODS.map((item) => (
          <Chip
            key={item}
            label={item}
            active={mood === item}
            onPress={() => setMood(mood === item ? undefined : item)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <TextInput label="Year from" value={yearFrom} onChangeText={setYearFrom} keyboardType="number-pad" style={styles.half} />
        <TextInput label="Year to" value={yearTo} onChangeText={setYearTo} keyboardType="number-pad" style={styles.half} />
      </View>
      <TextInput
        label="Duration (minutes)"
        value={durationMinutes}
        onChangeText={setDurationMinutes}
        keyboardType="number-pad"
        style={styles.field}
      />
      <TextInput label="Artist" value={artist} onChangeText={setArtist} style={styles.field} />
      <Text style={styles.hint}>Explicit content</Text>
      <View style={styles.wrapRow}>
        <Chip label="No filter" active={explicitContent === undefined} onPress={() => setExplicitContent(undefined)} />
        <Chip label="Filter explicit" active={explicitContent === false} onPress={() => setExplicitContent(false)} />
        <Chip label="Allow explicit" active={explicitContent === true} onPress={() => setExplicitContent(true)} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.hint}>Allow duplicate songs</Text>
        <Switch value={allowDuplicates} onValueChange={setAllowDuplicates} />
      </View>

      <Text style={styles.section}>Search on</Text>
      <View style={styles.wrapRow}>
        <Chip label="Spotify" active={provider === 'spotify'} onPress={() => setProvider('spotify')} />
        <Chip label="YouTube" active={provider === 'youtube'} onPress={() => setProvider('youtube')} />
        <Chip label="Both" active={provider === 'both'} onPress={() => setProvider('both')} />
      </View>
      <Text style={styles.section}>Create on</Text>
      <View style={styles.wrapRow}>
        <Chip label="Spotify" active={destination === 'spotify'} onPress={() => setDestination('spotify')} />
        <Chip label="YouTube" active={destination === 'youtube'} onPress={() => setDestination('youtube')} />
      </View>
      {provider === 'both' ? (
        <Text style={styles.meta}>
          Searching both services builds a provider-independent preview. Choose a destination before creating.
        </Text>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <Text style={styles.loading}>{LOADING_STAGES[stageIndex]}</Text> : null}

      <Button mode="contained" onPress={() => void generate()} loading={loading} disabled={loading}>
        {view ? 'Regenerate' : 'Generate Playlist'}
      </Button>

      {view ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>{view.playlist.title}</Text>
          <Text style={styles.body}>{view.playlist.description}</Text>
          <Text style={styles.meta}>
            Target duration:{' '}
            {view.summary.targetDurationMinutes != null ? `${view.summary.targetDurationMinutes} min` : 'not specified'}
          </Text>
          <Text style={styles.meta}>
            Actual duration: {formatDuration(actualMs)} ({view.summary.actualDurationMinutes} min)
          </Text>
          <Text style={styles.meta}>Number of tracks: {view.summary.trackCount}</Text>
          {view.summary.warning ? <Text style={styles.warning}>{view.summary.warning}</Text> : null}
          {view.summary.orderingNote ? <Text style={styles.meta}>{view.summary.orderingNote}</Text> : null}
        </View>
      ) : (
        <EmptyState
          title="Preview first"
          body="MusicMix searches Spotify and YouTube for real songs. Nothing is created until you review and confirm."
        />
      )}

      {tracks.map((track, index) => (
        <TrackCard
          key={trackId(track)}
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
          <Text style={styles.section}>Add songs</Text>
          <TextInput
            label="Search connected catalogs"
            value={addQuery}
            onChangeText={setAddQuery}
            onSubmitEditing={() => void searchToAdd()}
            style={styles.field}
          />
          <Button mode="outlined" onPress={() => void searchToAdd()} loading={adding} disabled={adding}>
            Add Songs
          </Button>
          {addResults.map((track) => (
            <TrackCard key={trackId(track)} track={track} onAdd={() => void addSong(track)} />
          ))}
          <Button
            mode="contained"
            disabled={!view || tracks.length === 0 || loading}
            onPress={() => void createPlaylist()}
          >
            Save Playlist
          </Button>
          <Text style={styles.hint}>
            Create Playlist runs only after this confirmation. Generation never creates a playlist on Spotify or YouTube.
          </Text>
        </>
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
  subtitle: {
    color: colors.muted,
    fontSize: 16,
  },
  body: {
    color: colors.muted,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.card,
    minHeight: 120,
  },
  field: {
    backgroundColor: colors.card,
  },
  half: {
    backgroundColor: colors.card,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
  },
  meta: {
    color: colors.cyan,
    fontSize: 13,
  },
  warning: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  loading: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  preview: {
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
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
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
