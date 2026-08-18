import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppInput } from '@/components/AppInput';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingState } from '@/components/LoadingState';
import { MatchConfidenceBadge } from '@/components/MatchConfidenceBadge';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import {
  useAnalyzeConversion,
  useConfirmConversion,
  useCreateConversion,
  useDestinationSearch,
  useRemotePlaylists,
  type ConversionDecision,
} from '@/hooks/useConversion';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useProviders } from '@/hooks/useProviders';
import { useToast } from '@/components/ToastProvider';
import { isAmazonMusicLive, providerDisplayName } from '@/constants/providers';
import { useAppTheme } from '@/theme/AppThemeProvider';
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
const STEPS = ['Source', 'Playlist', 'Destination', 'Analyze', 'Review', 'Confirm', 'Create'];

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

function stepIndex(phase: Phase): number {
  if (phase === 'review') return 4;
  if (phase === 'summary') return 5;
  if (phase === 'done') return 6;
  return 0;
}

export function ConvertPlaylistScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
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
  const [error, setError] = useState<string | null>(null);

  const remote = useRemotePlaylists(sourceProvider);
  const analyze = useAnalyzeConversion();
  const confirm = useConfirmConversion();
  const create = useCreateConversion();
  const debouncedManual = useDebouncedValue(manualQuery, 400);
  const manualSearch = useDestinationSearch(
    destinationProvider,
    debouncedManual,
    Boolean(manualFor) && debouncedManual.trim().length > 1,
  );

  const connected = (id: ConvertibleProvider): boolean =>
    Boolean(providers.data?.providers.find((item) => item.id === id)?.connected);

  const amazonLive = isAmazonMusicLive(providers.data?.providers);
  const comingSoon = (id: ConvertibleProvider): boolean => id === 'amazon_music' && !amazonLive;
  const selectable = (id: ConvertibleProvider): boolean => !comingSoon(id) && connected(id);
  const selectableIds = CONVERTIBLE.filter((id) => selectable(id));
  const sameService = sourceProvider === destinationProvider;
  const currentStep = phase === 'setup' ? (sourcePlaylistId ? 2 : 0) : stepIndex(phase);

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
      toast.show('Playlist converted', 'success');
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.text }]}>Convert Playlist</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Match songs through official APIs. The destination playlist is not created until you confirm.
      </Text>
      <View style={styles.steps} accessibilityLabel={`Step ${currentStep + 1} of ${STEPS.length}`}>
        {STEPS.map((label, index) => (
          <Text
            key={label}
            style={[
              styles.stepChip,
              {
                color: index <= currentStep ? colors.text : colors.muted,
                backgroundColor: index <= currentStep ? colors.accentMuted : colors.elevated,
              },
            ]}
          >
            {index + 1}. {label}
          </Text>
        ))}
      </View>
      {error ? <ErrorBanner message={error} /> : null}

      {phase === 'setup' ? (
        <>
          <Text style={[styles.step, { color: colors.text }]}>Select Source</Text>
          <View style={styles.row}>
            {CONVERTIBLE.map((id) => (
              <Chip
                key={id}
                label={
                  comingSoon(id)
                    ? 'Amazon Music — Coming Soon'
                    : `${providerDisplayName(id)}${!connected(id) ? ' (connect)' : ''}`
                }
                active={sourceProvider === id}
                disabled={!selectable(id)}
                onPress={() => {
                  setSourceProvider(id);
                  setSourcePlaylistId(undefined);
                  if (!allowSameProvider && destinationProvider === id) {
                    setDestinationProvider(fallbackDestination(id, selectableIds));
                  }
                }}
              />
            ))}
          </View>

          <Text style={[styles.step, { color: colors.text }]}>Select Playlist</Text>
          {remote.isFetching ? <LoadingState label="Loading playlists" /> : null}
          {remote.isError ? <ErrorBanner message={toUserMessage(remote.error)} /> : null}
          {(remote.data?.playlists ?? []).map((playlist) => (
            <AppCard
              key={playlist.providerPlaylistId}
              onPress={() => setSourcePlaylistId(playlist.providerPlaylistId)}
              accessibilityLabel={playlist.name}
              style={
                sourcePlaylistId === playlist.providerPlaylistId
                  ? { borderColor: colors.accent }
                  : undefined
              }
            >
              <Text style={[styles.song, { color: colors.text }]}>{playlist.name}</Text>
              <Text style={[styles.artist, { color: colors.muted }]}>
                {playlist.trackCount !== undefined ? `${playlist.trackCount} songs` : providerDisplayName(sourceProvider)}
              </Text>
            </AppCard>
          ))}
          {remote.isSuccess && (remote.data?.playlists.length ?? 0) === 0 ? (
            <EmptyState
              title="No playlists"
              body={`Connect ${providerDisplayName(sourceProvider)} to see your playlists, or pick another source.`}
              actionLabel="Open Settings"
              onAction={() => router.push('/(tabs)/settings')}
            />
          ) : null}

          <Text style={[styles.step, { color: colors.text }]}>Select Destination</Text>
          <View style={styles.row}>
            {CONVERTIBLE.map((id) => (
              <Chip
                key={id}
                label={comingSoon(id) ? 'Amazon Music — Coming Soon' : providerDisplayName(id)}
                active={destinationProvider === id}
                disabled={!selectable(id) || (id === sourceProvider && !allowSameProvider)}
                onPress={() => setDestinationProvider(id)}
              />
            ))}
          </View>
          <Pressable
            onPress={() => setAllowSameProvider((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allowSameProvider }}
            style={styles.check}
          >
            <Text style={[styles.link, { color: colors.cyan }]}>
              {allowSameProvider ? '☑' : '☐'} Duplicate this playlist on the same service
            </Text>
          </Pressable>
          {sameService && !allowSameProvider ? (
            <Text style={[styles.hint, { color: colors.warning }]}>Same-service copies are blocked unless you duplicate.</Text>
          ) : null}

          <Text style={[styles.step, { color: colors.text }]}>Analyze</Text>
          {analyze.isPending ? <LoadingState label="Analyzing playlist…" /> : null}
          <AppButton
            label="Find Matching Songs"
            loading={analyze.isPending}
            disabled={!sourcePlaylistId || analyze.isPending || (sameService && !allowSameProvider)}
            onPress={() => void runAnalyze()}
          />
        </>
      ) : null}

      {phase === 'review' && conversion ? (
        <>
          <AppButton label="Back" variant="secondary" onPress={() => setPhase('setup')} />
          <AppButton label="Accept all high-confidence matches" onPress={() => setPhase('summary')} />
          {conversion.matches.map((match) => {
            const status = effectiveStatus(match);
            const dest = effectiveDestination(match);
            const sourceTitle =
              match.sourceTrack.metadataConfidence !== undefined && match.sourceTrack.metadataConfidence < 80
                ? (match.sourceTrack.originalTitle ?? match.sourceTrack.title)
                : match.sourceTrack.title;
            return (
              <AppCard key={match.id}>
                <MatchConfidenceBadge status={status} confidence={match.confidence} />
                <Text style={[styles.matchMethod, { color: colors.muted }]}>{match.matchMethod ?? 'unmatched'}</Text>
                <Text style={[styles.sourceLabel, { color: colors.muted }]}>Source</Text>
                <Text style={[styles.song, { color: colors.text }]}>{sourceTitle}</Text>
                <Text style={[styles.artist, { color: colors.muted }]}>{match.sourceTrack.artist}</Text>
                {dest && status !== 'not_found' && status !== 'skipped' ? (
                  <>
                    <Text style={[styles.sourceLabel, { color: colors.muted }]}>Destination</Text>
                    <Text style={[styles.song, { color: colors.text }]}>{dest.title}</Text>
                    <Text style={[styles.artist, { color: colors.muted }]}>{dest.artist}</Text>
                  </>
                ) : null}
                <View style={styles.row}>
                  {dest && status !== 'skipped' && status !== 'duplicate' ? (
                    <Chip
                      label="Accept"
                      onPress={() => setDecision({ sourceTrackId: match.sourceTrackId, action: 'accept', destinationTrack: dest })}
                    />
                  ) : null}
                  <Chip label="Choose alternative" onPress={() => setPickerFor(match)} />
                  <Chip label="Skip" onPress={() => setDecision({ sourceTrackId: match.sourceTrackId, action: 'skip' })} />
                  <Chip
                    label="Search replacement"
                    onPress={() => {
                      setManualFor(match);
                      setManualQuery(`${match.sourceTrack.title} ${match.sourceTrack.artist}`);
                    }}
                  />
                </View>
              </AppCard>
            );
          })}
          <AppButton label="Continue to summary" onPress={() => setPhase('summary')} />
        </>
      ) : null}

      {phase === 'summary' && conversion ? (
        <>
          <Text style={[styles.step, { color: colors.text }]}>Confirm</Text>
          <AppCard>
            <Text style={[styles.body, { color: colors.muted }]}>Total source tracks: {reviewSummary.totalTracks}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Matched: {reviewSummary.matchedTracks}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Needs review: {reviewSummary.reviewTracks}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Not found: {reviewSummary.notFoundTracks}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Duplicates: {reviewSummary.duplicateTracks}</Text>
            <Text style={[styles.song, { color: colors.text }]}>
              Destination playlist will contain: {reviewSummary.destinationTrackCount} tracks
            </Text>
          </AppCard>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppButton label="Back" variant="secondary" onPress={() => setPhase('review')} />
            </View>
            <View style={styles.flex}>
              <AppButton
                label="Create Playlist"
                loading={confirm.isPending || create.isPending}
                disabled={confirm.isPending || create.isPending || reviewSummary.destinationTrackCount === 0}
                onPress={() => void runCreate()}
              />
            </View>
          </View>
        </>
      ) : null}

      {phase === 'done' && conversion ? (
        <>
          <Text style={[styles.song, { color: colors.text }]}>{conversion.createdMessage ?? 'Playlist created.'}</Text>
          {conversion.errorMessage ? <ErrorBanner message={conversion.errorMessage} /> : null}
          <AppButton
            label="View playlists"
            onPress={() => {
              if (conversion.localPlaylistId) {
                router.push(`/playlist/${conversion.localPlaylistId}`);
                return;
              }
              router.push('/(tabs)/playlists');
            }}
          />
          <AppButton
            label="Convert another"
            variant="secondary"
            onPress={() => {
              setPhase('setup');
              setConversion(null);
              setDecisions({});
            }}
          />
        </>
      ) : null}

      <BottomSheet visible={Boolean(pickerFor)} title="Possible Matches" onClose={() => setPickerFor(null)}>
        <Text style={[styles.body, { color: colors.muted }]}>
          {pickerFor?.sourceTrack.title} — {pickerFor?.sourceTrack.artist}
        </Text>
        {(pickerFor?.destinationTrack
          ? [{ track: pickerFor.destinationTrack, confidence: pickerFor.confidence }, ...pickerFor.alternatives]
          : pickerFor?.alternatives ?? []
        ).map((item) => (
          <TrackRow
            key={item.track.providerTrackId}
            track={item.track}
            confidence={item.confidence}
            actionLabel="Select"
            onSelect={() => {
              if (!pickerFor) {
                return;
              }
              setDecision({
                sourceTrackId: pickerFor.sourceTrackId,
                action: 'select_alternative',
                destinationTrack: item.track,
              });
              setPickerFor(null);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet visible={Boolean(manualFor)} title="Search replacement" onClose={() => setManualFor(null)}>
        <AppInput
          label="Search destination catalog"
          placeholder="Song title, artist"
          value={manualQuery}
          onChangeText={setManualQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {manualSearch.isFetching ? <LoadingState label="Searching" /> : null}
        {manualSearch.isError ? <ErrorBanner message={toUserMessage(manualSearch.error)} /> : null}
        {(manualSearch.data?.tracks ?? []).map((track) => (
          <TrackRow
            key={track.providerTrackId}
            track={track}
            actionLabel="Select"
            onSelect={() => {
              if (!manualFor) {
                return;
              }
              setDecision({
                sourceTrackId: manualFor.sourceTrackId,
                action: 'manual',
                destinationTrack: track,
              });
              setManualFor(null);
            }}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  body: {
    lineHeight: 20,
  },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stepChip: {
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  step: {
    fontWeight: '700',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  link: {
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
  },
  check: {
    minHeight: 44,
    justifyContent: 'center',
  },
  matchMethod: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  sourceLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  song: {
    fontWeight: '700',
    fontSize: 16,
  },
  artist: {
    fontSize: 14,
  },
});
