export const ErrorCode = {
  OAUTH_FAILED: 'OAUTH_FAILED',
  OAUTH_CANCELLED: 'OAUTH_CANCELLED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NO_SEARCH_RESULTS: 'NO_SEARCH_RESULTS',
  DUPLICATE_TRACK: 'DUPLICATE_TRACK',
  TRACK_UNAVAILABLE: 'TRACK_UNAVAILABLE',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  CONFLICT: 'CONFLICT',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = true;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(ErrorCode.CONFIGURATION_ERROR, message, 503);
    this.name = 'ConfigurationError';
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(provider: string, message: string) {
    super(ErrorCode.PROVIDER_UNAVAILABLE, message, 503, { provider });
    this.name = 'ProviderUnavailableError';
  }
}

export class OAuthFailedError extends AppError {
  constructor(message = 'Connecting your music account failed. Please try again.') {
    super(ErrorCode.OAUTH_FAILED, message, 401);
    this.name = 'OAuthFailedError';
  }
}

export class OAuthCancelledError extends AppError {
  constructor(message = 'YouTube connection was cancelled.') {
    super(ErrorCode.OAUTH_CANCELLED, message, 400);
    this.name = 'OAuthCancelledError';
  }
}

export class TokenExpiredError extends AppError {
  constructor(message = 'Your music-service session expired. Please reconnect the account.') {
    super(ErrorCode.TOKEN_EXPIRED, message, 401);
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends AppError {
  constructor(message = 'The music-service session is no longer valid. Please reconnect.') {
    super(ErrorCode.TOKEN_INVALID, message, 401);
    this.name = 'TokenInvalidError';
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super(
      ErrorCode.RATE_LIMITED,
      'The music service is temporarily limiting requests. Please wait a moment and try again.',
      429,
      retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined,
    );
    this.name = 'RateLimitedError';
  }
}

export class YouTubeQuotaExceededError extends AppError {
  constructor(
    message = 'YouTube search quota has been exceeded. Please try again later.',
  ) {
    super(ErrorCode.QUOTA_EXCEEDED, message, 429, {
      provider: 'youtube',
      retry: false,
    });
    this.name = 'YouTubeQuotaExceededError';
  }
}

export class OperationNotSupportedError extends AppError {
  constructor(message: string) {
    super(ErrorCode.NOT_SUPPORTED, message, 501);
    this.name = 'OperationNotSupportedError';
  }
}

export class NetworkError extends AppError {
  constructor(message = 'A network error occurred while contacting the music service.') {
    super(ErrorCode.NETWORK_ERROR, message, 503);
    this.name = 'NetworkError';
  }
}

export class NoSearchResultsError extends AppError {
  constructor(query: string) {
    super(ErrorCode.NO_SEARCH_RESULTS, `No songs matched “${query}”. Try a different search.`, 404, {
      query,
    });
    this.name = 'NoSearchResultsError';
  }
}

export class DuplicateTrackError extends AppError {
  constructor(message = 'That song is already in this playlist.') {
    super(ErrorCode.DUPLICATE_TRACK, message, 409);
    this.name = 'DuplicateTrackError';
  }
}

export class TrackUnavailableError extends AppError {
  constructor(message = 'This song is not available on the destination music service.') {
    super(ErrorCode.TRACK_UNAVAILABLE, message, 409);
    this.name = 'TrackUnavailableError';
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(
    message = 'MusicMix does not have permission to manage playlists on this account. Reconnect and grant playlist access.',
  ) {
    super(ErrorCode.INSUFFICIENT_PERMISSIONS, message, 403);
    this.name = 'InsufficientPermissionsError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super(ErrorCode.NOT_FOUND, message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(ErrorCode.CONFLICT, message, 409);
    this.name = 'ConflictError';
  }
}

export class AiUnavailableError extends AppError {
  constructor(
    message = 'The AI service is unavailable. Check AI_PROVIDER, AI_API_KEY, and AI_MODEL, then try again.',
  ) {
    super(ErrorCode.AI_UNAVAILABLE, message, 503);
    this.name = 'AiUnavailableError';
  }
}

/** True for expired provider access tokens, including AppError copies that lost `instanceof`. */
export function isAccessTokenExpiredError(error: unknown): boolean {
  return (
    error instanceof TokenExpiredError ||
    (error instanceof AppError && error.code === ErrorCode.TOKEN_EXPIRED)
  );
}

/** True when the user must reconnect a music service rather than retry a search. */
export function isProviderAuthError(error: unknown): boolean {
  if (isAccessTokenExpiredError(error)) {
    return true;
  }
  return (
    error instanceof TokenInvalidError ||
    (error instanceof AppError &&
      (error.code === ErrorCode.TOKEN_INVALID || error.code === ErrorCode.UNAUTHORIZED))
  );
}
