import {
  ConversionStatus,
  ConversionTrackStatus,
  type PlaylistConversion,
  type ConversionTrack,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import {
  ConflictError,
  DuplicateTrackError,
  NotFoundError,
  ProviderUnavailableError,
} from '../types/errors';
import type { PlaylistResult, ProviderId, TrackResult } from '../types/provider';
import { fromPrismaProvider, getProvider, requireEnabledProvider, toPrismaProvider } from '../providers/ProviderRegistry';
import { isNonRetryableProviderError } from '../providers/youtube/youtubeErrors';
import { mapPool } from '../utils/asyncPool';
import { withTransientRetry } from '../utils/retry';
import { requireStoredAccount, withProviderTokens } from './TokenService';
import { matchTrack, type MatchMethod } from './TrackMatcher';
import { upsertTrack } from './SearchService';
import {
  applyDestinationDuplicates,
  applyUserDecisions,
  mergeCandidates,
  rowFromDecision,
  rowsEligibleForDestination,
  searchQueriesForConversion,
  summarizeConversion,
  type ConversionMatchRow,
  type UserMatchDecision,
} from './conversionLogic';

const SEARCH_CONCURRENCY = 3;

export interface AnalyzeConversionInput {
  sourceProvider: ProviderId;
  sourcePlaylistId: string;
  destinationProvider: ProviderId;
  allowSameProvider?: boolean;
}

function asTrackResult(value: Prisma.JsonValue | null | undefined): TrackResult | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.provider !== 'string' || typeof record.providerTrackId !== 'string') {
    return undefined;
  }
  return value as unknown as TrackResult;
}

function asAlternativeList(
  value: Prisma.JsonValue | null | undefined,
): ConversionMatchRow['alternativeScores'] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ConversionMatchRow['alternativeScores'] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const track = asTrackResult((record.track as Prisma.JsonValue | undefined) ?? (item as Prisma.JsonValue));
    if (!track) {
      continue;
    }
    result.push({
      track,
      confidence: typeof record.confidence === 'number' ? record.confidence : 0,
      matchMethod: typeof record.matchMethod === 'string' ? (record.matchMethod as MatchMethod) : 'fuzzy',
    });
  }
  return result;
}

function rowFromRecord(track: ConversionTrack): ConversionMatchRow {
  const sourceTrack = asTrackResult(track.sourceSnapshot);
  if (!sourceTrack) {
    throw new NotFoundError('A conversion track is missing its source snapshot.');
  }
  const destinationTrack = asTrackResult(track.destinationSnapshot);
  const alternativeScores = asAlternativeList(track.alternativesSnapshot);
  return {
    sourceTrackId: track.sourceTrackId,
    destinationTrackId: track.destinationTrackId ?? undefined,
    sourceTrack,
    destinationTrack,
    alternatives: alternativeScores.map((item) => item.track),
    alternativeScores,
    confidence: track.confidence,
    matchMethod: (track.matchMethod as MatchMethod | undefined) ?? undefined,
    status: track.status,
    position: track.position,
  };
}

async function searchCandidates(
  userId: string,
  destination: ProviderId,
  source: TrackResult,
): Promise<TrackResult[]> {
  const adapter = getProvider(destination);
  const queries = searchQueriesForConversion(source, destination);
  const groups: TrackResult[][] = [];

  await withProviderTokens(userId, destination, async (tokens) => {
    for (const query of queries) {
      try {
        const found = await withTransientRetry(() =>
          adapter.searchTracks(tokens, { query, limit: 8 }),
        );
        groups.push(found);
      } catch (error) {
        if (isNonRetryableProviderError(error)) {
          if (groups.flat().length > 0) {
            return;
          }
          throw error;
        }
        throw error;
      }
      const merged = mergeCandidates(groups);
      const decision = matchTrack(source, merged);
      if (decision.status === 'matched') {
        return;
      }
    }
  });

  return mergeCandidates(groups);
}

export async function analyzeConversion(userId: string, input: AnalyzeConversionInput) {
  if (input.sourceProvider === 'amazon_music' || input.destinationProvider === 'amazon_music') {
    if (!getProvider('amazon_music').isEnabled()) {
      throw new ProviderUnavailableError(
        'amazon_music',
        'Amazon Music integration is currently unavailable because Amazon Music API access has not been configured.',
      );
    }
  }
  if (input.sourceProvider === input.destinationProvider && !input.allowSameProvider) {
    throw new ConflictError(
      'Source and destination must be different services. Enable “duplicate this playlist” to copy onto the same service.',
    );
  }

  requireEnabledProvider(input.sourceProvider);
  requireEnabledProvider(input.destinationProvider);
  await requireStoredAccount(userId, input.sourceProvider);
  await requireStoredAccount(userId, input.destinationProvider);

  const sourceAdapter = getProvider(input.sourceProvider);
  let sourcePlaylist: PlaylistResult & { tracks: TrackResult[] };
  try {
    sourcePlaylist = await withProviderTokens(userId, input.sourceProvider, (tokens) =>
      withTransientRetry(() => sourceAdapter.getPlaylist(tokens, input.sourcePlaylistId)),
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new NotFoundError('That source playlist is unavailable. It may be private or was deleted.');
    }
    throw error;
  }

  const matchedRows = await mapPool(sourcePlaylist.tracks, SEARCH_CONCURRENCY, async (source, index) => {
    const candidates = await searchCandidates(userId, input.destinationProvider, source);
    const row = rowFromDecision(matchTrack(source, candidates), index);
    return row;
  });

  const rows = applyDestinationDuplicates(matchedRows);
  const summary = summarizeConversion(rows);

  const conversion = await prisma.playlistConversion.create({
    data: {
      userId,
      sourceProvider: toPrismaProvider(input.sourceProvider),
      sourcePlaylistId: input.sourcePlaylistId,
      sourcePlaylistName: sourcePlaylist.name,
      sourcePlaylistDescription: sourcePlaylist.description,
      destinationProvider: toPrismaProvider(input.destinationProvider),
      status: ConversionStatus.ANALYZED,
      totalTracks: summary.totalTracks,
      matchedTracks: summary.matchedTracks,
      reviewTracks: summary.reviewTracks,
      notFoundTracks: summary.notFoundTracks,
      duplicateTracks: summary.duplicateTracks,
      tracks: {
        create: rows.map((row) => ({
          sourceTrackId: row.sourceTrackId,
          destinationTrackId: row.destinationTrackId,
          confidence: row.confidence,
          matchMethod: row.matchMethod,
          status: row.status as ConversionTrackStatus,
          sourceSnapshot: row.sourceTrack as unknown as Prisma.InputJsonValue,
          destinationSnapshot: (row.destinationTrack ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
          alternativesSnapshot: row.alternativeScores as unknown as Prisma.InputJsonValue,
          position: row.position,
        })),
      },
    },
    include: { tracks: { orderBy: { position: 'asc' } } },
  });

  return serializeConversion(conversion);
}

export async function getConversion(userId: string, conversionId: string) {
  const conversion = await prisma.playlistConversion.findFirst({
    where: { id: conversionId, userId },
    include: { tracks: { orderBy: { position: 'asc' } } },
  });
  if (!conversion) {
    throw new NotFoundError('That conversion was not found.');
  }
  return serializeConversion(conversion);
}

export async function confirmConversion(
  userId: string,
  conversionId: string,
  input: { acceptAllHighConfidence?: boolean; decisions?: UserMatchDecision[] },
) {
  const conversion = await prisma.playlistConversion.findFirst({
    where: { id: conversionId, userId },
    include: { tracks: { orderBy: { position: 'asc' } } },
  });
  if (!conversion) {
    throw new NotFoundError('That conversion was not found.');
  }
  if (
    conversion.status === ConversionStatus.CREATED ||
    conversion.status === ConversionStatus.FAILED
  ) {
    throw new ConflictError('This conversion can no longer be edited.');
  }

  const rows = applyUserDecisions(
    conversion.tracks.map(rowFromRecord),
    input.decisions ?? [],
    Boolean(input.acceptAllHighConfidence),
  );
  const summary = summarizeConversion(rows);

  await prisma.$transaction(
    conversion.tracks.map((track, index) => {
      const row = rows[index];
      if (!row) {
        throw new NotFoundError('Conversion track list is out of sync.');
      }
      return prisma.conversionTrack.update({
        where: { id: track.id },
        data: {
          destinationTrackId: row.destinationTrackId ?? null,
          confidence: row.confidence,
          matchMethod: row.matchMethod ?? null,
          status: row.status as ConversionTrackStatus,
          destinationSnapshot: row.destinationTrack
            ? (row.destinationTrack as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    }),
  );

  const updated = await prisma.playlistConversion.update({
    where: { id: conversion.id },
    data: {
      status: ConversionStatus.CONFIRMED,
      matchedTracks: summary.matchedTracks,
      reviewTracks: summary.reviewTracks,
      notFoundTracks: summary.notFoundTracks,
      duplicateTracks: summary.duplicateTracks,
      totalTracks: summary.totalTracks,
    },
    include: { tracks: { orderBy: { position: 'asc' } } },
  });

  return serializeConversion(updated);
}

export async function createConvertedPlaylist(
  userId: string,
  conversionId: string,
  input?: { name?: string; description?: string },
) {
  const conversion = await prisma.playlistConversion.findFirst({
    where: { id: conversionId, userId },
    include: { tracks: { orderBy: { position: 'asc' } } },
  });
  if (!conversion) {
    throw new NotFoundError('That conversion was not found.');
  }
  if (conversion.status === ConversionStatus.ANALYZED) {
    throw new ConflictError('Confirm selected matches before creating the destination playlist.');
  }
  if (conversion.status === ConversionStatus.FAILED && !conversion.destinationPlaylistId) {
    throw new ConflictError('This conversion failed before a playlist was created. Start a new conversion.');
  }

  const destination = fromPrismaProvider(conversion.destinationProvider);
  const adapter = getProvider(destination);
  const rows = conversion.tracks.map(rowFromRecord);
  const eligible = rowsEligibleForDestination(rows);
  if (eligible.length === 0 && !conversion.destinationPlaylistId) {
    throw new ConflictError('No confirmed matches to add. Accept matches before creating the playlist.');
  }
  const pending = eligible.filter((row) => {
    const record = conversion.tracks.find((track) => track.position === row.position);
    return Boolean(record && !record.addedToDestination);
  });

  let destinationPlaylistId = conversion.destinationPlaylistId;
  const playlistName = input?.name?.trim() || conversion.sourcePlaylistName || 'Converted playlist';
  const playlistDescription =
    input?.description ?? conversion.sourcePlaylistDescription ?? undefined;

  try {
    if (!destinationPlaylistId) {
      const created = await withProviderTokens(userId, destination, (tokens) =>
        withTransientRetry(() =>
          adapter.createPlaylist(tokens, {
            name: playlistName,
            description: playlistDescription,
          }),
        ),
      );
      destinationPlaylistId = created.providerPlaylistId;
      await prisma.playlistConversion.update({
        where: { id: conversion.id },
        data: { destinationPlaylistId },
      });
    }

    let added = conversion.addedTracks;
    for (const row of pending) {
      const stored = conversion.tracks.find((track) => track.sourceTrackId === row.sourceTrackId);
      const remoteId = row.destinationTrackId;
      if (!stored || !remoteId || !destinationPlaylistId) {
        continue;
      }
      try {
        await withProviderTokens(userId, destination, (tokens) =>
          withTransientRetry(() => adapter.addTracksToPlaylist(tokens, destinationPlaylistId!, [remoteId])),
        );
        await prisma.conversionTrack.update({
          where: { id: stored.id },
          data: { addedToDestination: true, errorMessage: null },
        });
        added += 1;
      } catch (error) {
        if (error instanceof DuplicateTrackError) {
          await prisma.conversionTrack.update({
            where: { id: stored.id },
            data: { addedToDestination: true, errorMessage: null },
          });
          added += 1;
          continue;
        }
        const message = error instanceof Error ? error.message : 'Could not add this song.';
        await prisma.conversionTrack.update({
          where: { id: stored.id },
          data: { errorMessage: message },
        });
        if (isNonRetryableProviderError(error)) {
          const partial = await prisma.playlistConversion.update({
            where: { id: conversion.id },
            data: {
              status: ConversionStatus.PARTIAL,
              addedTracks: added,
              errorMessage: `Playlist created with ${added} of ${eligible.length} tracks. ${message}`,
            },
            include: { tracks: { orderBy: { position: 'asc' } } },
          });
          return serializeConversion(partial, {
            createdMessage: `Playlist created with ${added} of ${eligible.length} tracks.`,
          });
        }
      }
    }

    const local = await persistLocalCopy(userId, conversion, destination, destinationPlaylistId, eligible, playlistName, playlistDescription);

    const complete = added >= eligible.length;
    const updated = await prisma.playlistConversion.update({
      where: { id: conversion.id },
      data: {
        status: complete ? ConversionStatus.CREATED : ConversionStatus.PARTIAL,
        destinationPlaylistId,
        localPlaylistId: local?.id,
        addedTracks: added,
        completedAt: complete ? new Date() : undefined,
        errorMessage: complete
          ? null
          : `Playlist created with ${added} of ${eligible.length} tracks.`,
      },
      include: { tracks: { orderBy: { position: 'asc' } } },
    });

    return serializeConversion(updated, {
      createdMessage: complete
        ? `Created “${playlistName}” with ${added} tracks.`
        : `Playlist created with ${added} of ${eligible.length} tracks.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Playlist creation failed.';
    const failed = await prisma.playlistConversion.update({
      where: { id: conversion.id },
      data: {
        status: destinationPlaylistId ? ConversionStatus.PARTIAL : ConversionStatus.FAILED,
        destinationPlaylistId,
        errorMessage: message,
      },
      include: { tracks: { orderBy: { position: 'asc' } } },
    });
    return serializeConversion(failed, { createdMessage: message });
  }
}

async function persistLocalCopy(
  userId: string,
  conversion: PlaylistConversion & { tracks: ConversionTrack[] },
  destination: ProviderId,
  destinationPlaylistId: string,
  eligible: ConversionMatchRow[],
  name: string,
  description?: string,
) {
  if (conversion.localPlaylistId) {
    return { id: conversion.localPlaylistId };
  }
  const tracks = eligible
    .map((row) => row.destinationTrack)
    .filter((track): track is TrackResult => Boolean(track));
  const created = await prisma.playlist.create({
    data: {
      userId,
      name,
      description,
      sourceProvider: toPrismaProvider(destination),
      sourcePlaylistId: destinationPlaylistId,
    },
  });
  for (const [index, result] of tracks.entries()) {
    const track = await upsertTrack(result);
    await prisma.playlistTrack.create({
      data: { playlistId: created.id, trackId: track.id, position: index },
    });
  }
  return created;
}

export function serializeConversion(
  conversion: PlaylistConversion & { tracks: ConversionTrack[] },
  extra?: { createdMessage?: string },
) {
  const rows = conversion.tracks.map(rowFromRecord);
  const summary = {
    totalTracks: conversion.totalTracks,
    matchedTracks: conversion.matchedTracks,
    reviewTracks: conversion.reviewTracks,
    notFoundTracks: conversion.notFoundTracks,
    duplicateTracks: conversion.duplicateTracks,
    destinationTrackCount: rowsEligibleForDestination(rows).length,
    addedTracks: conversion.addedTracks,
  };
  return {
    conversionId: conversion.id,
    status: conversion.status,
    sourceProvider: fromPrismaProvider(conversion.sourceProvider),
    sourcePlaylistId: conversion.sourcePlaylistId,
    sourcePlaylistName: conversion.sourcePlaylistName,
    destinationProvider: fromPrismaProvider(conversion.destinationProvider),
    destinationPlaylistId: conversion.destinationPlaylistId,
    localPlaylistId: conversion.localPlaylistId,
    summary,
    errorMessage: conversion.errorMessage,
    createdMessage: extra?.createdMessage,
    createdAt: conversion.createdAt.toISOString(),
    completedAt: conversion.completedAt?.toISOString() ?? null,
    matches: conversion.tracks.map((track) => {
      const row = rowFromRecord(track);
      return {
        id: track.id,
        sourceTrackId: track.sourceTrackId,
        destinationTrackId: track.destinationTrackId,
        sourceTrack: row.sourceTrack,
        destinationTrack: row.destinationTrack ?? null,
        alternatives: row.alternativeScores.map((item) => ({
          track: item.track,
          confidence: item.confidence,
          matchMethod: item.matchMethod,
        })),
        confidence: track.confidence,
        matchMethod: track.matchMethod,
        status: track.status.toLowerCase(),
        addedToDestination: track.addedToDestination,
        errorMessage: track.errorMessage,
      };
    }),
  };
}
