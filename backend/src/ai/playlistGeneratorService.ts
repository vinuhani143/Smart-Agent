import { Prisma, type PlaylistGeneration } from '@prisma/client';
import { prisma } from '../config/prisma';
import { toPrismaProvider } from '../providers/ProviderRegistry';
import { DuplicateDetector } from '../services/DuplicateDetector';
import { createLocalPlaylist } from '../services/PlaylistService';
import { searchConnectedProviders, searchProvider } from '../services/SearchService';
import { AppError, ErrorCode, NotFoundError } from '../types/errors';
import type { ProviderId, TrackResult } from '../types/provider';
import { mapPool } from '../utils/asyncPool';
import { logger } from '../utils/logger';
import { getAIProvider } from './configurableLlmProvider';
import { selectByDuration } from './duration';
import { applyIntentHints } from './intentParser';
import { validateIntent } from './intentValidation';
import {
  assertGenerateDoesNotCreate,
  assertReadyToCreate,
  classifySearchError,
  durationShortageWarning,
} from './generationRules';
import { orderTracks } from './playlistOrder';
import { buildSearchQueries } from './searchQueries';
import { filterScoredTracks, scoreTrack } from './trackScoring';
import type { PlaylistIntent, ScoredTrack, SearchProviderChoice } from './types';

export interface GeneratePlaylistInput {
  prompt: string;
  provider?: SearchProviderChoice;
  destinationProvider?: 'spotify' | 'youtube';
  language?: string;
  mood?: string;
  genre?: string;
  theme?: string;
  artist?: string;
  yearFrom?: number;
  yearTo?: number;
  durationMinutes?: number;
  maxTracks?: number;
  allowDuplicates?: boolean;
  explicitContent?: boolean;
}

export interface PlaylistPreviewTrack extends TrackResult {
  trackScore: number;
  breakdown: ScoredTrack['breakdown'];
  metadataFlags: ScoredTrack['metadataFlags'];
}

export interface PlaylistGenerationView {
  generationId: string;
  intent: PlaylistIntent;
  playlist: {
    title: string;
    description: string;
    tracks: PlaylistPreviewTrack[];
  };
  summary: {
    targetDurationMinutes: number | null;
    actualDurationMinutes: number;
    trackCount: number;
    warning: string | null;
    orderingNote: string | null;
    searchQueries: string[];
    sourceProvider: SearchProviderChoice;
    destinationProvider: 'spotify' | 'youtube' | null;
  };
  status: string;
  confirmationRequired: true;
}

function trackKey(track: TrackResult): string {
  return `${track.provider}:${track.providerTrackId}`;
}

function toPreview(item: ScoredTrack): PlaylistPreviewTrack {
  return {
    ...item.track,
    trackScore: item.trackScore,
    breakdown: item.breakdown,
    metadataFlags: item.metadataFlags,
  };
}

function isTrackResult(value: unknown): value is TrackResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record.provider === 'spotify' || record.provider === 'youtube' || record.provider === 'amazon_music') &&
    typeof record.providerTrackId === 'string' &&
    typeof record.title === 'string' &&
    typeof record.artist === 'string'
  );
}

function parseScoredTracks(value: Prisma.JsonValue): ScoredTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ScoredTrack[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const nested = record.track;
    const track = isTrackResult(nested)
      ? nested
      : isTrackResult(record)
        ? (record as unknown as TrackResult)
        : null;
    if (!track) {
      continue;
    }
    const flags = record.metadataFlags;
    const breakdown = record.breakdown;
    result.push({
      track,
      trackScore: typeof record.trackScore === 'number' ? record.trackScore : 0,
      breakdown:
        breakdown && typeof breakdown === 'object' && !Array.isArray(breakdown)
          ? (breakdown as ScoredTrack['breakdown'])
          : {
              languageMatch: 0,
              genreMatch: 0,
              moodMatch: 0,
              yearMatch: 0,
              artistMatch: 0,
              metadataConfidence: 0,
              providerAvailability: 0,
            },
      metadataFlags:
        flags && typeof flags === 'object' && !Array.isArray(flags)
          ? (flags as ScoredTrack['metadataFlags'])
          : {
              language: 'unknown',
              genre: 'unknown',
              mood: 'unknown',
              year: 'unknown',
              explicit: track.explicit === undefined ? 'unknown' : 'known',
              energy: 'unknown',
              tempo: 'unknown',
            },
    });
  }
  return result;
}

function parseIntent(value: Prisma.JsonValue): PlaylistIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as PlaylistIntent;
}

function parseQueries(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function toView(row: PlaylistGeneration): PlaylistGenerationView {
  const scored = parseScoredTracks(row.candidateTracks);
  const intent = parseIntent(row.parsedIntent);
  return {
    generationId: row.id,
    intent,
    playlist: {
      title: row.generatedTitle ?? 'Generated playlist',
      description: row.generatedDescription ?? '',
      tracks: scored.map(toPreview),
    },
    summary: {
      targetDurationMinutes: intent.durationMinutes ?? null,
      actualDurationMinutes: row.durationMinutes ?? Math.round(row.totalDurationMs / 60000),
      trackCount: row.trackCount,
      warning: row.warning,
      orderingNote: row.orderingStrategy,
      searchQueries: parseQueries(row.searchQueries),
      sourceProvider:
        row.provider === 'spotify' || row.provider === 'youtube' || row.provider === 'both'
          ? row.provider
          : 'both',
      destinationProvider:
        row.destinationProvider === 'SPOTIFY'
          ? 'spotify'
          : row.destinationProvider === 'YOUTUBE'
            ? 'youtube'
            : null,
    },
    status: row.status,
    confirmationRequired: true,
  };
}

function sourceFrom(intent: PlaylistIntent, requested?: SearchProviderChoice): SearchProviderChoice {
  if (requested) {
    return requested;
  }
  if (intent.sourceProvider) {
    return intent.sourceProvider;
  }
  return 'both';
}

function restrictTo(source: SearchProviderChoice): ProviderId[] | undefined {
  if (source === 'spotify') {
    return ['spotify'];
  }
  if (source === 'youtube') {
    return ['youtube'];
  }
  return ['spotify', 'youtube'];
}

function hintsFromInput(input: GeneratePlaylistInput): Partial<PlaylistIntent> {
  return {
    language: input.language,
    mood: input.mood,
    genre: input.genre,
    theme: input.theme,
    artist: input.artist,
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    durationMinutes: input.durationMinutes,
    maxTracks: input.maxTracks,
    allowDuplicates: input.allowDuplicates,
    explicitContent: input.explicitContent,
    sourceProvider: input.provider,
    destinationProvider: input.destinationProvider,
  };
}

async function searchOneQuery(
  userId: string,
  query: string,
  intent: PlaylistIntent,
  source: SearchProviderChoice,
): Promise<{ tracks: TrackResult[]; error?: unknown }> {
  try {
    const tracks = await searchConnectedProviders(
      userId,
      {
        query,
        language: intent.language,
        genre: intent.genre,
        mood: intent.mood,
        yearFrom: intent.yearFrom,
        yearTo: intent.yearTo,
        limit: 8,
      },
      restrictTo(source),
    );
    return { tracks };
  } catch (error) {
    const kind = classifySearchError(error);
    if (kind === 'empty') {
      return { tracks: [] };
    }
    return { tracks: [], error };
  }
}

export class PlaylistGeneratorService {
  static async generate(userId: string, input: GeneratePlaylistInput): Promise<PlaylistGenerationView> {
    const prompt = input.prompt.trim();
    const ai = getAIProvider();
    const parsed = await ai.parsePlaylistRequest(prompt, hintsFromInput(input));
    const intent = applyIntentHints(parsed, hintsFromInput(input));
    validateIntent(intent, prompt);

    const source = sourceFrom(intent, input.provider);
    const queries = buildSearchQueries({ ...intent, sourceProvider: source }, prompt);

    const unique = new Map<string, TrackResult>();
    const searchErrors: unknown[] = [];

    const batches = await mapPool(queries, 2, async (query) => searchOneQuery(userId, query, intent, source));
    for (const batch of batches) {
      if (batch.error) {
        searchErrors.push(batch.error);
      }
      for (const track of batch.tracks) {
        if (source !== 'both' && track.provider !== source) {
          continue;
        }
        if (!unique.has(trackKey(track))) {
          unique.set(trackKey(track), track);
        }
      }
    }

    const fatal = searchErrors.find((error) => classifySearchError(error) === 'fatal');
    if (unique.size === 0 && fatal) {
      throw fatal;
    }
    if (unique.size === 0 && searchErrors.length > 0 && batches.every((batch) => batch.tracks.length === 0)) {
      const quota = searchErrors.find((error) => classifySearchError(error) === 'soft');
      if (quota) {
        throw quota;
      }
    }

    let discovered = [...unique.values()];
    discovered = new DuplicateDetector().unique(discovered, intent.allowDuplicates === true);

    const scored = filterScoredTracks(
      discovered.map((track) => scoreTrack(track, intent, queries)),
      intent,
    ).sort((a, b) => b.trackScore - a.trackScore);

    const ranked = await ai.rankTracks(scored, intent);
    const selected = selectByDuration(ranked, intent.durationMinutes, intent.maxTracks);
    const ordered = orderTracks(selected.tracks, intent);
    const copy =
      ordered.tracks.length > 0
        ? await ai.generatePlaylistDescription(intent, ordered.tracks)
        : {
            title: 'No matching songs',
            description: 'No suitable songs were found for this request.',
          };

    const warning =
      durationShortageWarning(
        ordered.tracks.length,
        Math.round(selected.totalDurationMs / 60000),
        intent.durationMinutes,
      ) ?? (searchErrors.length > 0 && ordered.tracks.length > 0 ? 'Some searches could not be completed.' : null);

    const status = ordered.tracks.length === 0 ? 'FAILED' : 'GENERATED';
    assertGenerateDoesNotCreate(status);

    const row = await prisma.playlistGeneration.create({
      data: {
        userId,
        requestText: prompt,
        parsedIntent: intent as Prisma.InputJsonValue,
        generatedTitle: copy.title,
        generatedDescription: copy.description,
        provider: source,
        destinationProvider: intent.destinationProvider ? toPrismaProvider(intent.destinationProvider) : undefined,
        trackCount: ordered.tracks.length,
        durationMinutes: Math.round(selected.totalDurationMs / 60000),
        totalDurationMs: selected.totalDurationMs,
        status,
        candidateTracks: JSON.parse(JSON.stringify(ordered.tracks)) as Prisma.InputJsonValue,
        searchQueries: queries,
        orderingStrategy: ordered.note ?? ordered.strategy,
        warning,
        errorMessage: ordered.tracks.length === 0 ? 'Only 0 suitable songs were found.' : null,
      },
    });

    if (searchErrors.length > 0) {
      logger.warn('AI playlist search had provider errors', {
        generationId: row.id,
        errorCount: searchErrors.length,
      });
    }

    return toView(row);
  }

  static async get(userId: string, id: string): Promise<PlaylistGenerationView> {
    const row = await prisma.playlistGeneration.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundError('Playlist generation not found.');
    }
    return toView(row);
  }

  static async update(
    userId: string,
    id: string,
    patch: {
      title?: string;
      description?: string;
      trackIds?: string[];
      addTrack?: TrackResult;
    },
  ): Promise<PlaylistGenerationView> {
    const row = await prisma.playlistGeneration.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundError('Playlist generation not found.');
    }
    if (row.status === 'CREATED') {
      throw new AppError(ErrorCode.CONFLICT, 'This playlist was already created.', 409);
    }

    let tracks = parseScoredTracks(row.candidateTracks);
    const intent = parseIntent(row.parsedIntent);

    if (patch.trackIds) {
      const byId = new Map(tracks.map((item) => [trackKey(item.track), item]));
      tracks = patch.trackIds
        .map((key) => byId.get(key))
        .filter((item): item is ScoredTrack => item !== undefined);
    }

    if (patch.addTrack) {
      const detector = new DuplicateDetector();
      detector.unique(tracks.map((item) => item.track));
      if (!detector.has(patch.addTrack)) {
        const queries = parseQueries(row.searchQueries);
        tracks = [...tracks, scoreTrack(patch.addTrack, intent, queries)];
      }
    }

    const totalDurationMs = tracks.reduce((sum, item) => sum + (item.track.durationMs ?? 0), 0);
    const updated = await prisma.playlistGeneration.update({
      where: { id: row.id },
      data: {
        generatedTitle: patch.title?.trim() || row.generatedTitle,
        generatedDescription: patch.description?.trim() || row.generatedDescription,
        candidateTracks: JSON.parse(JSON.stringify(tracks)) as Prisma.InputJsonValue,
        trackCount: tracks.length,
        totalDurationMs,
        durationMinutes: Math.round(totalDurationMs / 60000),
        status: 'EDITED',
        warning: durationShortageWarning(
          tracks.length,
          Math.round(totalDurationMs / 60000),
          intent.durationMinutes,
        ),
      },
    });
    return toView(updated);
  }

  static async replaceTrack(
    userId: string,
    id: string,
    key: string,
  ): Promise<PlaylistGenerationView> {
    const row = await prisma.playlistGeneration.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundError('Playlist generation not found.');
    }
    if (row.status === 'CREATED') {
      throw new AppError(ErrorCode.CONFLICT, 'This playlist was already created.', 409);
    }

    const tracks = parseScoredTracks(row.candidateTracks);
    const index = tracks.findIndex((item) => trackKey(item.track) === key);
    if (index === -1) {
      throw new NotFoundError('That song is not in this preview.');
    }

    const current = tracks[index]!;
    const intent = parseIntent(row.parsedIntent);
    const source = sourceFrom(intent);
    const query = `${current.track.title} ${current.track.artist}`;
    let alternatives: TrackResult[] = [];
    try {
      alternatives =
        source === 'both'
          ? await searchConnectedProviders(userId, { query, limit: 8 }, ['spotify', 'youtube'])
          : await searchProvider(userId, source, { query, limit: 8 });
    } catch (error) {
      if (classifySearchError(error) === 'empty') {
        throw new AppError(ErrorCode.NO_SEARCH_RESULTS, 'No replacement songs were found.', 404);
      }
      throw error;
    }

    const detector = new DuplicateDetector();
    detector.unique(tracks.map((item) => item.track));
    const replacement = alternatives.find((track) => !detector.has(track));
    if (!replacement) {
      throw new AppError(ErrorCode.NO_SEARCH_RESULTS, 'No replacement songs were found.', 404);
    }

    const next = [...tracks];
    next[index] = scoreTrack(replacement, intent, parseQueries(row.searchQueries));
    const totalDurationMs = next.reduce((sum, item) => sum + (item.track.durationMs ?? 0), 0);
    const updated = await prisma.playlistGeneration.update({
      where: { id: row.id },
      data: {
        candidateTracks: JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue,
        trackCount: next.length,
        totalDurationMs,
        durationMinutes: Math.round(totalDurationMs / 60000),
        status: 'EDITED',
      },
    });
    return toView(updated);
  }

  static async createOnProvider(
    userId: string,
    id: string,
    destinationProvider?: 'spotify' | 'youtube',
  ): Promise<{ playlistId: string; generationId: string; confirmationRequired: false }> {
    const row = await prisma.playlistGeneration.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundError('Playlist generation not found.');
    }
    if (row.status === 'CREATED' && row.resultPlaylistId) {
      return { playlistId: row.resultPlaylistId, generationId: row.id, confirmationRequired: false };
    }

    const tracks = parseScoredTracks(row.candidateTracks);
    assertReadyToCreate(row.status, tracks.length);

    const destination =
      destinationProvider ??
      (row.destinationProvider === 'SPOTIFY'
        ? 'spotify'
        : row.destinationProvider === 'YOUTUBE'
          ? 'youtube'
          : undefined);

    if (!destination) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Choose Spotify or YouTube as the destination, then confirm Create Playlist.',
        400,
      );
    }

    const intent = parseIntent(row.parsedIntent);
    const created = await createLocalPlaylist(userId, {
      name: row.generatedTitle || 'Generated playlist',
      description: row.generatedDescription ?? undefined,
      language: intent.language,
      genre: intent.genre,
      mood: intent.mood,
      yearFrom: intent.yearFrom,
      yearTo: intent.yearTo,
      targetDurationMs: row.totalDurationMs,
      tracks: tracks.map((item) => item.track),
      targetProvider: destination,
      allowDuplicates: intent.allowDuplicates === true,
    });

    await prisma.playlistGeneration.update({
      where: { id: row.id },
      data: {
        status: 'CREATED',
        resultPlaylistId: created.id,
        destinationProvider: toPrismaProvider(destination),
      },
    });

    return { playlistId: created.id, generationId: row.id, confirmationRequired: false };
  }
}
