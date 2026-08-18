import {
  AppError,
  ConflictError,
  ErrorCode,
  NetworkError,
  NoSearchResultsError,
  ProviderUnavailableError,
  RateLimitedError,
  TokenExpiredError,
  TokenInvalidError,
  YouTubeQuotaExceededError,
} from '../types/errors';

export type SearchErrorClass = 'empty' | 'fatal' | 'soft';

export function classifySearchError(error: unknown): SearchErrorClass {
  if (error instanceof NoSearchResultsError) {
    return 'empty';
  }
  if (error instanceof TokenInvalidError || error instanceof TokenExpiredError) {
    return 'fatal';
  }
  if (
    error instanceof YouTubeQuotaExceededError ||
    error instanceof RateLimitedError ||
    error instanceof NetworkError ||
    error instanceof ProviderUnavailableError
  ) {
    return 'soft';
  }
  if (error instanceof AppError && error.code === ErrorCode.QUOTA_EXCEEDED) {
    return 'soft';
  }
  if (error instanceof AppError && error.code === ErrorCode.RATE_LIMITED) {
    return 'soft';
  }
  return 'soft';
}

export function fewTracksWarning(found: number, requestedMax?: number): string | null {
  if (found === 0) {
    return 'Only 0 suitable songs were found.';
  }
  if (requestedMax !== undefined && found < requestedMax) {
    return `Only ${found} suitable songs were found.`;
  }
  return null;
}

export function durationShortageWarning(
  found: number,
  actualMinutes: number,
  targetMinutes: number | undefined,
): string | null {
  if (found === 0) {
    return 'Only 0 suitable songs were found.';
  }
  if (targetMinutes !== undefined && actualMinutes < targetMinutes - 2) {
    return `Only ${found} suitable songs were found.`;
  }
  return null;
}

export function assertReadyToCreate(status: string, trackCount: number): void {
  if (status === 'CREATED') {
    throw new ConflictError('This playlist was already created.');
  }
  if (status === 'FAILED' || trackCount === 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Only 0 suitable songs were found.', 400);
  }
  if (status !== 'GENERATED' && status !== 'EDITED' && status !== 'CONFIRMED') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Review the generated playlist before creating it.', 400);
  }
}

export function assertGenerateDoesNotCreate(status: string): void {
  if (status === 'CREATED') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Generation must not create a provider playlist.', 500);
  }
}

export function userSafeAiMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'The AI service rejected the configured credentials. Check AI_API_KEY.';
  }
  if (status === 404) {
    return 'The configured AI model was not found. Check AI_MODEL.';
  }
  if (status === 429) {
    return 'AI provider rate limit reached. Try again later.';
  }
  if (status >= 500) {
    return 'The AI service is temporarily unavailable. Try again later.';
  }
  return 'The AI service could not complete this request.';
}
