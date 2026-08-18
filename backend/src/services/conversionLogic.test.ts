import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseYouTubeTitle } from '../providers/youtube/parseYouTubeTitle';
import {
  applyDestinationDuplicates,
  applyUserDecisions,
  rowsEligibleForDestination,
  searchQueriesForConversion,
  summarizeConversion,
  type ConversionMatchRow,
} from './conversionLogic';
import {
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  confidenceBand,
  decideMatchStatus,
  matchTrack,
  scoreMatch,
} from './TrackMatcher';
import type { TrackResult } from '../types/provider';

function spotifyTrack(title: string, artist: string, extra?: Partial<TrackResult>): TrackResult {
  return {
    provider: 'spotify',
    providerTrackId: extra?.providerTrackId ?? 'sp1',
    title,
    artist,
    album: extra?.album,
    isrc: extra?.isrc,
    spotifyId: extra?.providerTrackId ?? extra?.spotifyId ?? 'sp1',
    ...extra,
  };
}

function youtubeTrack(rawTitle: string, channel: string, videoId = 'yt1'): TrackResult {
  const parsed = parseYouTubeTitle(rawTitle, channel);
  return {
    provider: 'youtube',
    providerTrackId: videoId,
    youtubeVideoId: videoId,
    title: parsed.title,
    artist: parsed.artist,
    originalTitle: parsed.originalTitle,
    metadataConfidence: parsed.confidence,
    parsedTitle: parsed.parsedTitle,
    parsedArtist: parsed.parsedArtist,
  };
}

function row(partial: Partial<ConversionMatchRow> & Pick<ConversionMatchRow, 'sourceTrack'>): ConversionMatchRow {
  return {
    sourceTrackId: partial.sourceTrack.providerTrackId,
    destinationTrackId: partial.destinationTrack?.providerTrackId,
    alternatives: [],
    alternativeScores: [],
    confidence: 0,
    status: 'NOT_FOUND',
    position: 0,
    ...partial,
  };
}

describe('TrackMatcher conversion scoring', () => {
  it('scores an official-audio YouTube title at 96% (exact)', () => {
    const source = spotifyTrack('Song Name', 'Artist Name');
    const candidate = youtubeTrack('Artist Name - Song Name (Official Audio)', 'Artist Name');
    const score = scoreMatch(source, candidate);
    assert.equal(score.confidence, 96);
    assert.equal(score.matchMethod, 'exact_title_artist');
    assert.equal(score.needsReview, false);
    assert.equal(confidenceBand(score.confidence), 'high');
  });

  it('uses ISRC when both sides have it', () => {
    const source = spotifyTrack('A', 'B', { isrc: 'USABC1234567' });
    const candidate = { ...youtubeTrack('unrelated title', 'channel'), isrc: 'US-ABC-12-34567' };
    const score = scoreMatch(source, candidate);
    assert.equal(score.confidence, 99);
    assert.equal(score.matchMethod, 'isrc');
    assert.equal(score.needsReview, false);
  });

  it('marks fuzzy matches below 90 as needing review', () => {
    const source = spotifyTrack('Midnight Rain', 'Taylor Swift');
    const candidate = youtubeTrack('Cooking with rain sounds 10 hours', 'White Noise');
    const score = scoreMatch(source, candidate);
    assert.ok(score.confidence < HIGH_CONFIDENCE_THRESHOLD);
    assert.equal(score.needsReview, true);
  });

  it('classifies 75–89 as medium confidence and not auto-matched', () => {
    assert.equal(confidenceBand(88), 'medium');
    assert.equal(confidenceBand(75), 'medium');
    assert.equal(decideMatchStatus({
      track: youtubeTrack('Song', 'Artist'),
      confidence: 80,
      reason: 'Normalized title + artist',
      matchMethod: 'normalized_title_artist',
      needsReview: true,
    }), 'needs_review');
    assert.ok(MEDIUM_CONFIDENCE_THRESHOLD === 75);
  });

  it('does not auto-select a low-confidence best candidate', () => {
    const candidate: TrackResult = {
      provider: 'youtube',
      providerTrackId: 'yt-low',
      youtubeVideoId: 'yt-low',
      title: 'Rain at Midnight (Audio)',
      artist: 'Taylor Swift',
      parsedTitle: 'Rain at Midnight',
      parsedArtist: 'Taylor Swift',
    };
    const decision = matchTrack(spotifyTrack('Midnight Rain', 'Taylor Swift'), [candidate]);
    assert.ok(decision.best);
    assert.ok(decision.best.confidence < HIGH_CONFIDENCE_THRESHOLD);
    assert.notEqual(decision.status, 'matched');
    assert.equal(decision.best.needsReview, true);
  });

  it('returns not_found when there are no usable candidates', () => {
    const decision = matchTrack(spotifyTrack('Song Name', 'Artist Name'), []);
    assert.equal(decision.status, 'not_found');
    assert.equal(decision.best, null);
  });
});

describe('conversion search queries', () => {
  it('searches Spotify → YouTube as artist+title, then title+artist, then album', () => {
    const queries = searchQueriesForConversion(
      spotifyTrack('Song Name', 'Artist Name', { album: 'The Album' }),
      'youtube',
    );
    assert.deepEqual(queries, [
      'Artist Name Song Name',
      'Song Name Artist Name',
      'Artist Name Song Name The Album',
    ]);
  });

  it('searches YouTube → Spotify using extracted title + artist', () => {
    const source = youtubeTrack('Artist Name - Song Name (Official Audio)', 'Artist Name');
    const queries = searchQueriesForConversion(source, 'spotify');
    assert.ok(queries[0]?.includes(source.parsedTitle ?? source.title));
    assert.ok(queries[0]?.includes(source.parsedArtist ?? source.artist));
  });
});

describe('conversion summary and confirmation', () => {
  const high: ConversionMatchRow = row({
    sourceTrack: spotifyTrack('A', 'Artist', { providerTrackId: 's1', spotifyId: 's1' }),
    destinationTrack: youtubeTrack('Artist - A (Official Audio)', 'Artist', 'y1'),
    destinationTrackId: 'y1',
    confidence: 96,
    matchMethod: 'exact_title_artist',
    status: 'MATCHED',
    position: 0,
  });
  const review: ConversionMatchRow = row({
    sourceTrack: spotifyTrack('B', 'Artist', { providerTrackId: 's2', spotifyId: 's2' }),
    destinationTrack: youtubeTrack('Artist - B Live', 'Artist', 'y2'),
    destinationTrackId: 'y2',
    confidence: 72,
    matchMethod: 'fuzzy',
    status: 'NEEDS_REVIEW',
    position: 1,
  });
  const missing: ConversionMatchRow = row({
    sourceTrack: spotifyTrack('C', 'Artist', { providerTrackId: 's3', spotifyId: 's3' }),
    status: 'NOT_FOUND',
    position: 2,
  });

  it('summarizes matched / review / not found / destination counts', () => {
    const summary = summarizeConversion([high, review, missing]);
    assert.equal(summary.totalTracks, 3);
    assert.equal(summary.matchedTracks, 1);
    assert.equal(summary.reviewTracks, 1);
    assert.equal(summary.notFoundTracks, 1);
    assert.equal(summary.destinationTrackCount, 1);
  });

  it('keeps the highest-confidence destination when two sources collide', () => {
    const first = { ...high, confidence: 91 };
    const second: ConversionMatchRow = row({
      sourceTrack: spotifyTrack('A copy', 'Artist', { providerTrackId: 's9', spotifyId: 's9' }),
      destinationTrack: high.destinationTrack,
      destinationTrackId: 'y1',
      confidence: 96,
      status: 'MATCHED',
      position: 1,
    });
    const marked = applyDestinationDuplicates([first, second]);
    assert.equal(marked[0]?.status, 'DUPLICATE');
    assert.equal(marked[1]?.status, 'MATCHED');
    assert.equal(summarizeConversion(marked).duplicateTracks, 1);
  });

  it('does not include skipped or unresolved tracks in the destination set', () => {
    const confirmed = applyUserDecisions([high, review, missing], [
      { sourceTrackId: 's2', action: 'skip' },
    ], true);
    const eligible = rowsEligibleForDestination(confirmed);
    assert.equal(confirmed[0]?.status, 'ACCEPTED');
    assert.equal(confirmed[1]?.status, 'SKIPPED');
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0]?.sourceTrackId, 's1');
  });

  it('saves manual search as confidence 100 / matchMethod manual', () => {
    const manualDest = youtubeTrack('Artist - C (Official Audio)', 'Artist', 'y-manual');
    const confirmed = applyUserDecisions([missing], [
      {
        sourceTrackId: 's3',
        action: 'manual',
        destinationTrack: manualDest,
      },
    ], false);
    assert.equal(confirmed[0]?.status, 'MANUAL');
    assert.equal(confirmed[0]?.confidence, 100);
    assert.equal(confirmed[0]?.matchMethod, 'manual');
    assert.equal(rowsEligibleForDestination(confirmed).length, 1);
  });
});
