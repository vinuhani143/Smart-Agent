import { AppError, ErrorCode } from '../types/errors';
import type { PlaylistIntent } from './types';

export function validateIntent(intent: PlaylistIntent, prompt: string): PlaylistIntent {
  const trimmed = prompt.trim();
  if (trimmed.length < 3) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Describe the playlist you want in a bit more detail.', 400);
  }

  if (intent.yearFrom !== undefined && (intent.yearFrom < 1900 || intent.yearFrom > 2100)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'The start year is not valid.', 400);
  }
  if (intent.yearTo !== undefined && (intent.yearTo < 1900 || intent.yearTo > 2100)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'The end year is not valid.', 400);
  }
  if (
    intent.yearFrom !== undefined &&
    intent.yearTo !== undefined &&
    intent.yearFrom > intent.yearTo
  ) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'The year range is invalid. Use an earlier start year.', 400);
  }
  if (intent.durationMinutes !== undefined && (intent.durationMinutes < 1 || intent.durationMinutes > 600)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Duration must be between 1 and 600 minutes.', 400);
  }
  if (intent.maxTracks !== undefined && (intent.maxTracks < 1 || intent.maxTracks > 100)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Track count must be between 1 and 100.', 400);
  }

  const hasSignal =
    Boolean(intent.language) ||
    Boolean(intent.genre) ||
    Boolean(intent.mood) ||
    Boolean(intent.theme) ||
    Boolean(intent.artist) ||
    intent.yearFrom !== undefined ||
    intent.durationMinutes !== undefined ||
    trimmed.length >= 8;
  if (!hasSignal) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Add a language, mood, years, or duration so we can search real catalogs.', 400);
  }

  return intent;
}
