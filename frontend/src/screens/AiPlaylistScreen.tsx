import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { TrackCard } from '@/components/TrackCard';
import { colors } from '@/constants/theme';
import { apiFetch } from '@/services/api';
import { useUiStore } from '@/store/uiStore';
import type { GeneratePlaylistPayload, TrackResult } from '@/types';
import { formatDuration } from '@/utils/format';
import { toUserMessage } from '@/utils/errors';

interface GenerateResponse {
  requestId: string;
  interpretation: string;
  totalDurationMs: number;
  tracks: TrackResult[];
  confirmationRequired: true;
}

export function AiPlaylistScreen() {
  const [prompt, setPrompt] = useState(
    'Create a 2 hour Telugu romantic melody playlist from 1995 to 2010 without duplicate songs.',
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const draftTracks = useUiStore((state) => state.draftTracks);
  const setDraftTracks = useUiStore((state) => state.setDraftTracks);
  const removeDraftTrack = useUiStore((state) => state.removeDraftTrack);

  async function generate(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const payload: GeneratePlaylistPayload = { prompt, allowDuplicates: false };
      const result = await apiFetch<GenerateResponse>('/api/ai/generate-playlist', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setRequestId(result.requestId);
      setInterpretation(result.interpretation);
      setTotalDurationMs(result.totalDurationMs);
      setDraftTracks(result.tracks);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!requestId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ playlistId: string }>(
        `/api/ai/generate-playlist/${requestId}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'AI playlist' }),
        },
      );
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
      <Text style={styles.body}>Describe the playlist you want. MusicMix will search connected services and wait for your confirmation before creating anything.</Text>
      <TextInput
        label="Describe the playlist you want"
        value={prompt}
        onChangeText={setPrompt}
        multiline
        style={styles.input}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button mode="contained" onPress={() => void generate()} loading={loading} disabled={loading}>
        {draftTracks.length > 0 ? 'Regenerate' : 'Generate preview'}
      </Button>
      {interpretation ? <Text style={styles.meta}>{interpretation}</Text> : null}
      {draftTracks.length > 0 ? (
        <Text style={styles.meta}>
          {draftTracks.length} songs · {formatDuration(totalDurationMs)}
        </Text>
      ) : (
        <EmptyState
          title="Preview first"
          body="Generated tracks appear here so you can remove songs before creating the playlist."
        />
      )}
      {draftTracks.map((track) => (
        <TrackCard
          key={`${track.provider}:${track.providerTrackId}`}
          track={track}
          onRemove={() => removeDraftTrack(track.providerTrackId)}
        />
      ))}
      <Button mode="outlined" onPress={() => router.push('/(tabs)/search')}>
        Add Song
      </Button>
      <Button
        mode="contained"
        disabled={!requestId || draftTracks.length === 0 || loading}
        onPress={() => void confirm()}
      >
        Create Playlist
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.card,
    minHeight: 120,
  },
  meta: {
    color: colors.cyan,
    fontSize: 13,
  },
});
