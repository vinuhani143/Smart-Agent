import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Searchbar } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { TrackCard } from '@/components/TrackCard';
import { colors } from '@/constants/theme';
import {
  useAnalyzeConversion,
  useConfirmConversion,
  useCreateConversion,
  useDestinationSearch,
  useRemotePlaylists,
  type ConversionDecision,
} from '@/hooks/useConversion';
import { useProviders } from '@/hooks/useProviders';
import { isAmazonMusicLive, providerDisplayName } from '@/constants/providers';
import type {
  ConversionMatch,
  ConversionMatchStatus,
  ConversionResult,
  ConvertibleProvider,
  TrackResult,
} from '@/types';
import { toUserMessage } from '@/utils/errors';

type Phase = 'setup' | 'review' | 'summary' | 'done';
const CONVERTIBLE: ConvertibleProvider[] = ['spotify', 'youtube', 'amazon_music'];

function fallbackDestination(
  current: ConvertibleProvider,
  selectable: ConvertibleProvider[],
): ConvertibleProvider {
  const other = selectable.find((id) => id !== current);
  if (other) {
    return other;
  }
  return current === 'spotify' ? 'youtube' : 'spotify';
}

function statusGlyph(status: ConversionMatchStatus, confidence: number): { mark: string; color: string; label: string } {
  if (status === 'matched' || status === 'accepted' || status === 'manual') {
    return { mark: '✓', color: colors.success, label: `${confidence}%` };
  }
  if (status === 'needs_review') {
    return { mark: '⚠', color: colors.warning, label: confidence > 0 ? `${confidence}% possible match` : 'Needs review' };
  }
  if (status === 'duplicate') {
    return { mark: '⧉', color: colors.muted, label: 'Duplicate' };
  }
  if (status === 'skipped') {
    return { mark: '–', color: colors.muted, label: 'Skipped' };
  }
  return { mark: '✕', color: colors.danger, label: 'Not Found' };
}

export function ConvertPlaylistScreen() {
  const providers = useProviders();
  const [phase, setPhase] = useState<Phase>('setup');
  const [sourceProvider, setSourceProvider] = useState<ConvertibleProvider>('spotify');
  const [destinationProvider, setDestinationProvider] = useState<ConvertibleProvider>('youtube');
  const [sourcePlaylistId, setSourcePlaylistId] = useState<string | undefined>();
  const [allowSameProvider, setAllowSameProvider] = useState(false);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ConversionDecision>>({});
  const [pickerFor, setPickerFor] = useState<ConversionMatch | null>(null);
  const [manualFor, setManualFor] = useState<ConversionMatch | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [submittedManual, setSubmittedManual] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remote = useRemotePlaylists(sourceProvider);
  const analyze = useAnalyzeConversion();
  const confirm = useConfirmConversion();
  const create = useCreateConversion();
  const manualSearch = useDestinationSearch(destinationProvider, submittedManual, Boolean(manualFor));

  const connected = (id: ConvertibleProvider): boolean =>
    Boolean(providers.data?.providers.find((item) => item.id === id)?.connected);

  const amazonLive = isAmazonMusicLive(providers.data?.providers);

  const comingSoon = (id: ConvertibleProvider): boolean => id === 'amazon_music' && !amazonLive;

  const selectable = (id: ConvertibleProvider): boolean => {
    if (comingSoon(id)) {
      return false;
    }
    return connected(id);
  };

  const selectableIds = CONVERTIBLE.filter((id) => selectable(id));

  const sameService = sourceProvider === destinationProvider;

  function setDecision(decision: ConversionDecision): void {
    setDecisions((current) => ({ ...current, [decision.sourceTrackId]: decision }));
  }

  function effectiveStatus(match: ConversionMatch): ConversionMatchStatus {
    const decision = decisions[match.sourceTrackId];
    if (!decision) {
      return match.status;
    }
    if (decision.action === 'skip') {
      return 'skipped';
    }
    if (decision.action === 'manual') {
      return 'manual';
    }
    return 'accepted';
  }

  function effectiveDestination(match: ConversionMatch): TrackResult | null {
    const decision = decisions[match.sourceTrackId];
    if (decision?.destinationTrack) {
      return decision.destinationTrack;
    }
    return match.destinationTrack ?? null;
  }

  const reviewSummary = useMemo(() => {
    const matches = conversion?.matches ?? [];
    let matched = 0;
    let review = 0;
    let notFound = 0;
    let duplicates = 0;
    let destination = 0;
    for (const match of matches) {
      const status = effectiveStatus(match);
      if (status === 'matched' || status === 'accepted' || status === 'manual') {
        matched += 1;
        if (effectiveDestination(match)) {
          destination += 1;
        }
      } else if (status === 'needs_review') {
        review += 1;
      } else if (status === 'not_found') {
        notFound += 1;
      } else if (status === 'duplicate') {
        duplicates += 1;
      }
    }
    return {
      totalTracks: matches.length,
      matchedTracks: matched,
      reviewTracks: review,
      notFoundTracks: notFound,
      duplicateTracks: duplicates,
      destinationTrackCount: destination,
    };
  }, [conversion, decisions]);

  async function runAnalyze(): Promise<void> {
    if (!sourcePlaylistId) {
      return;
    }
    setError(null);
    try {
      const result = await analyze.mutateAsync({
        sourceProvider,
        sourcePlaylistId,
        destinationProvider,
        allowSameProvider,
      });
      setConversion(result);
      setDecisions({});
      setPhase('review');
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function runCreate(): Promise<void> {
    if (!conversion) {
      return;
    }
    setError(null);
    try {
      const confirmed = await confirm.mutateAsync({
        conversionId: conversion.conversionId,
        acceptAllHighConfidence: true,
        decisions: Object.values(decisions),
      });
      setConversion(confirmed);
      const created = await create.mutateAsync({
        conversionId: confirmed.conversionId,
        name: confirmed.sourcePlaylistName ?? undefined,
        description: undefined,
      });
      setConversion(created);
      setPhase('done');
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Convert Playlist</Text>
      <Text style={styles.body}>
        Match songs through official APIs. The destination playlist is not created until you confirm.
      </Text>
      {error ? <ErrorBanner message={error} /> : null}

      {phase === 'setup' ? (
        <>
          <Text style={styles.step}>Step 1: Select Source</Text>
          <View style={styles.row}>
            {CONVERTIBLE.map((id) => (
              <Button
                key={id}
                mode={sourceProvider === id ? 'contained' : 'outlined'}
                disabled={!selectable(id)}
                onPress={() => {
                  setSourceProvider(id);
                  setSourcePlaylistId(undefined);
                  if (!allowSameProvider && destinationProvider === id) {
                    setDestinationProvider(fallbackDestination(id, selectableIds));
                  }
                }}
              >
                {comingSoon(id)
                  ? 'Amazon Music — Coming Soon'
                  : `${providerDisplayName(id)}${!connected(id) ? ' (connect)' : ''}`}
              </Button>
            ))}
          </View>

          <Text style={styles.step}>Step 2: Select Playlist</Text>
          {remote.isError ? <ErrorBanner message={toUserMessage(remote.error)} /> : null}
          {(remote.data?.playlists ?? []).map((playlist) => (
            <Button
              key={playlist.providerPlaylistId}
              mode={sourcePlaylistId === playlist.providerPlaylistId ? 'contained' : 'outlined'}
              onPress={() => setSourcePlaylistId(playlist.providerPlaylistId)}
              style={styles.choice}
            >
              {playlist.name}
              {playlist.trackCount !== undefined ? ` (${playlist.trackCount})` : ''}
            </Button>
          ))}
          {remote.isSuccess && (remote.data?.playlists.length ?? 0) === 0 ? (
            <EmptyState title="No playlists" body={`No ${providerDisplayName(sourceProvider)} playlists were returned.`} />
          ) : null}

          <Text style={styles.step}>Step 3: Select Destination</Text>
          <View style={styles.row}>
            {CONVERTIBLE.map((id) => (
              <Button
                key={id}
                mode={destinationProvider === id ? 'contained' : 'outlined'}
                disabled={!selectable(id) || (id === sourceProvider && !allowSameProvider)}
                onPress={() => setDestinationProvider(id)}
              >
                {comingSoon(id) ? 'Amazon Music — Coming Soon' : providerDisplayName(id)}
              </Button>
            ))}
          </View>
          <Pressable onPress={() => setAllowSameProvider((value) => !value)}>
            <Text style={styles.link}>
              {allowSameProvider ? '☑' : '☐'} Duplicate this playlist on the same service
            </Text>
          </Pressable>
          {sameService && !allowSameProvider ? (
            <Text style={styles.hint}>Same-service copies are blocked unless you duplicate.</Text>
          ) : null}

          <Text style={styles.step}>Step 4: Analyze Playlist</Text>
          <Button
            mode="contained"
            loading={analyze.isPending}
            disabled={!sourcePlaylistId || analyze.isPending || (sameService && !allowSameProvider)}
            onPress={() => void runAnalyze()}
          >
            Find Matching Songs
          </Button>
        </>
      ) : null}

      {phase === 'review' && conversion ? (
        <>
          <Button mode="outlined" onPress={() => setPhase('setup')}>
            Back
          </Button>
          <Button mode="contained" onPress={() => setPhase('summary')}>
            Accept all high-confidence matches
          </Button>
          {conversion.matches.map((match) => {
            const status = effectiveStatus(match);
            const glyph = statusGlyph(status, match.confidence);
            const dest = effectiveDestination(match);
            const sourceTitle =
              match.sourceTrack.metadataConfidence !== undefined && match.sourceTrack.metadataConfidence < 80
                ? (match.sourceTrack.originalTitle ?? match.sourceTrack.title)
                : match.sourceTrack.title;
            return (
              <View key={match.id} style={styles.card}>
                <Text style={[styles.glyph, { color: glyph.color }]}>
                  {glyph.mark} {glyph.label}
                </Text>
                <Text style={styles.matchMethod}>{match.matchMethod ?? 'unmatched'}</Text>
                <Text style={styles.sourceLabel}>Source</Text>
                <Text style={styles.song}>{sourceTitle}</Text>
                <Text style={styles.artist}>{match.sourceTrack.artist}</Text>
                {dest && status !== 'not_found' && status !== 'skipped' ? (
                  <>
                    <Text style={styles.sourceLabel}>Destination</Text>
                    <Text style={styles.song}>{dest.title}</Text>
                    <Text style={styles.artist}>{dest.artist}</Text>
                  </>
                ) : null}
                <View style={styles.row}>
                  {dest && status !== 'skipped' && status !== 'duplicate' ? (
                    <Button compact onPress={() => setDecision({ sourceTrackId: match.sourceTrackId, action: 'accept', destinationTrack: dest })}>
                      Accept Match
                    </Button>
                  ) : null}
                  <Button compact onPress={() => setPickerFor(match)}>
                    Choose Alternative
                  </Button>
                  <Button compact onPress={() => setDecision({ sourceTrackId: match.sourceTrackId, action: 'skip' })}>
                    Skip
                  </Button>
                  <Button compact onPress={() => {
                    setManualFor(match);
                    setManualQuery(`${match.sourceTrack.title} ${match.sourceTrack.artist}`);
                    setSubmittedManual('');
                  }}>
                    Search Manually
                  </Button>
                </View>
              </View>
            );
          })}
          <Button mode="contained" onPress={() => setPhase('summary')}>
            Continue to summary
          </Button>
        </>
      ) : null}

      {phase === 'summary' && conversion ? (
        <>
          <Text style={styles.step}>Conversion summary</Text>
          <Text style={styles.body}>Total source tracks: {reviewSummary.totalTracks}</Text>
          <Text style={styles.body}>Matched: {reviewSummary.matchedTracks}</Text>
          <Text style={styles.body}>Needs review: {reviewSummary.reviewTracks}</Text>
          <Text style={styles.body}>Not found: {reviewSummary.notFoundTracks}</Text>
          <Text style={styles.body}>Duplicates: {reviewSummary.duplicateTracks}</Text>
          <Text style={styles.song}>Destination playlist will contain: {reviewSummary.destinationTrackCount} tracks</Text>
          <View style={styles.row}>
            <Button mode="outlined" onPress={() => setPhase('review')}>
              Back
            </Button>
            <Button
              mode="contained"
              loading={confirm.isPending || create.isPending}
              disabled={confirm.isPending || create.isPending || reviewSummary.destinationTrackCount === 0}
              onPress={() => void runCreate()}
            >
              Create Playlist
            </Button>
          </View>
        </>
      ) : null}

      {phase === 'done' && conversion ? (
        <>
          <Text style={styles.song}>{conversion.createdMessage ?? 'Playlist created.'}</Text>
          {conversion.errorMessage ? <ErrorBanner message={conversion.errorMessage} /> : null}
          <Button mode="contained" onPress={() => {
            if (conversion.localPlaylistId) {
              router.push(`/playlist/${conversion.localPlaylistId}`);
              return;
            }
            router.push('/(tabs)/playlists');
          }}>
            View playlists
          </Button>
          <Button mode="outlined" onPress={() => {
            setPhase('setup');
            setConversion(null);
            setDecisions({});
          }}>
            Convert another
          </Button>
        </>
      ) : null}

      {pickerFor ? (
        <View style={styles.overlay}>
          <Text style={styles.step}>Possible Matches</Text>
          <Text style={styles.body}>
            {pickerFor.sourceTrack.title} — {pickerFor.sourceTrack.artist}
          </Text>
          {(pickerFor.destinationTrack
            ? [{ track: pickerFor.destinationTrack, confidence: pickerFor.confidence }, ...pickerFor.alternatives]
            : pickerFor.alternatives
          ).map((item) => (
            <TrackCard
              key={item.track.providerTrackId}
              track={item.track}
              confidence={item.confidence}
              actionLabel="Select"
              onSelect={() => {
                setDecision({
                  sourceTrackId: pickerFor.sourceTrackId,
                  action: 'select_alternative',
                  destinationTrack: item.track,
                });
                setPickerFor(null);
              }}
            />
          ))}
          <Button onPress={() => setPickerFor(null)}>Cancel</Button>
        </View>
      ) : null}

      {manualFor ? (
        <View style={styles.overlay}>
          <Text style={styles.step}>Search Manually</Text>
          <Searchbar
            placeholder="Song title, artist"
            value={manualQuery}
            onChangeText={setManualQuery}
            onSubmitEditing={() => setSubmittedManual(manualQuery.trim())}
            onIconPress={() => setSubmittedManual(manualQuery.trim())}
            style={styles.search}
            inputStyle={{ color: colors.text }}
            placeholderTextColor={colors.muted}
          />
          {manualSearch.isError ? <ErrorBanner message={toUserMessage(manualSearch.error)} /> : null}
          {(manualSearch.data?.tracks ?? []).map((track) => (
            <TrackCard
              key={track.providerTrackId}
              track={track}
              actionLabel="Select"
              onSelect={() => {
                setDecision({
                  sourceTrackId: manualFor.sourceTrackId,
                  action: 'manual',
                  destinationTrack: track,
                });
                setManualFor(null);
              }}
            />
          ))}
          <Button onPress={() => setManualFor(null)}>Cancel</Button>
        </View>
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
  body: {
    color: colors.muted,
    lineHeight: 20,
  },
  step: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    alignSelf: 'flex-start',
  },
  link: {
    color: colors.cyan,
    fontWeight: '600',
  },
  hint: {
    color: colors.warning,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  glyph: {
    fontWeight: '800',
    fontSize: 16,
  },
  matchMethod: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  sourceLabel: {
    color: colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  song: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  artist: {
    color: colors.muted,
  },
  overlay: {
    backgroundColor: colors.elevated,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  search: {
    backgroundColor: colors.card,
    borderRadius: 16,
  },
});
