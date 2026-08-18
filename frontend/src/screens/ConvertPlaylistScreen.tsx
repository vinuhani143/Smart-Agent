import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { TrackCard } from '@/components/TrackCard';
import { colors } from '@/constants/theme';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useProviders } from '@/hooks/useProviders';
import { apiFetch } from '@/services/api';
import type { ProviderId, TrackResult } from '@/types';
import { toUserMessage } from '@/utils/errors';

interface ConvertMatch {
  source: TrackResult;
  best: { track: TrackResult; confidence: number; reason: string; needsReview: boolean } | null;
  alternatives: Array<{ track: TrackResult; confidence: number; reason: string }>;
}

export function ConvertPlaylistScreen() {
  const playlists = usePlaylists();
  const providers = useProviders();
  const [sourceId, setSourceId] = useState<string | undefined>(playlists.data?.playlists[0]?.id);
  const [destination, setDestination] = useState<ProviderId>('spotify');
  const [matches, setMatches] = useState<ConvertMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Screen>
      <Text style={styles.title}>Convert Playlist</Text>
      <Text style={styles.body}>
        Match songs onto another service. Low-confidence matches are not selected automatically — review
        them before creating the destination playlist.
      </Text>
      {error ? <ErrorBanner message={error} /> : null}

      <Text style={styles.label}>Source playlist</Text>
      {(playlists.data?.playlists ?? []).map((playlist) => (
        <Button
          key={playlist.id}
          mode={sourceId === playlist.id ? 'contained' : 'outlined'}
          onPress={() => setSourceId(playlist.id)}
          style={styles.choice}
        >
          {playlist.name}
        </Button>
      ))}

      <Text style={styles.label}>Destination</Text>
      {(providers.data?.providers ?? []).map((provider) => (
        <Button
          key={provider.id}
          disabled={!provider.enabled || !provider.connected}
          mode={destination === provider.id ? 'contained' : 'outlined'}
          onPress={() => setDestination(provider.id)}
          style={styles.choice}
        >
          {provider.name}
          {!provider.connected && provider.enabled ? ' (not connected)' : ''}
          {!provider.enabled ? ' (unavailable)' : ''}
        </Button>
      ))}

      <Button
        mode="contained"
        loading={loading}
        disabled={!sourceId || loading}
        onPress={async () => {
          if (!sourceId) return;
          setLoading(true);
          setError(null);
          try {
            const result = await apiFetch<{ matches: ConvertMatch[] }>('/api/playlists/convert', {
              method: 'POST',
              body: JSON.stringify({
                sourcePlaylistId: sourceId,
                destinationProvider: destination,
              }),
            });
            setMatches(result.matches);
          } catch (err) {
            setError(toUserMessage(err));
          } finally {
            setLoading(false);
          }
        }}
      >
        Preview conversion
      </Button>

      {matches.length === 0 ? (
        <EmptyState
          title="No preview yet"
          body="Choose a playlist and a connected destination, then preview matches."
        />
      ) : null}

      {matches.map((match) => (
        <TrackCard
          key={`${match.source.title}-${match.source.artist}`}
          track={match.best?.track ?? match.source}
          confidence={match.best?.confidence}
        />
      ))}
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
  label: {
    color: colors.text,
    fontWeight: '700',
    marginTop: 8,
  },
  choice: {
    alignSelf: 'flex-start',
  },
});
