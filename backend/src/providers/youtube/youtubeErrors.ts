import {
  AppError,
  ErrorCode,
  ConfigurationError,
  InsufficientPermissionsError,
  NetworkError,
  NotFoundError,
  OAuthCancelledError,
  OAuthFailedError,
  TokenExpiredError,
  TokenInvalidError,
  TrackUnavailableError,
  YouTubeQuotaExceededError,
} from '../../types/errors';

interface GoogleErrorItem {
  reason?: string;
  message?: string;
  domain?: string;
}

interface GoogleErrorBody {
  error?:
    | string
    | {
        code?: number;
        message?: string;
        status?: string;
        errors?: GoogleErrorItem[];
      };
  error_description?: string;
}

export function asGoogleErrorBody(value: unknown): GoogleErrorBody | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as GoogleErrorBody;
}

export function googleErrorReason(body: GoogleErrorBody | undefined): string | undefined {
  if (!body?.error) {
    return undefined;
  }
  if (typeof body.error === 'string') {
    return body.error;
  }
  const reason = body.error.errors?.[0]?.reason ?? body.error.status;
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
}

/** True for Google OAuth / YouTube JSON errors. False for Spotify `{ error: { status: number } }`. */
export function isGoogleErrorPayload(body: GoogleErrorBody | undefined): boolean {
  if (!body?.error) {
    return false;
  }
  if (typeof body.error === 'string') {
    return true;
  }
  if (Array.isArray(body.error.errors) && body.error.errors.length > 0) {
    return true;
  }
  if (typeof body.error.status === 'string') {
    return true;
  }
  return typeof body.error.code === 'number' && typeof body.error.message === 'string';
}

export function googleErrorMessage(body: GoogleErrorBody | undefined): string | undefined {
  if (!body) {
    return undefined;
  }
  if (typeof body.error === 'string') {
    return body.error_description ?? body.error;
  }
  return body.error?.message ?? body.error_description;
}

/**
 * Map official Google/YouTube error payloads to human-readable AppErrors.
 * Never retries quota exceeded. Never exposes tokens.
 */
export function mapGoogleApiError(status: number, body: unknown): AppError | undefined {
  const parsed = asGoogleErrorBody(body);
  if (!isGoogleErrorPayload(parsed)) {
    return undefined;
  }
  const reason = (googleErrorReason(parsed) ?? '').toLowerCase();
  const message = googleErrorMessage(parsed) ?? '';

  if (
    reason === 'quotaexceeded' ||
    reason === 'dailylimitexceeded' ||
    reason === 'userratelimitexceeded' ||
    /quota/i.test(message)
  ) {
    return new YouTubeQuotaExceededError();
  }

  if (reason === 'access_denied') {
    return new OAuthCancelledError('YouTube connection was cancelled.');
  }

  if (reason === 'invalid_client') {
    return new ConfigurationError(
      'Google OAuth client ID or client secret is invalid. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    );
  }

  if (
    reason === 'invalid_grant' ||
    reason === 'invalid_token' ||
    reason === 'autherror' ||
    reason === 'expired' ||
    reason === 'invalidcredentials'
  ) {
    if (reason === 'invalid_grant' || reason === 'expired') {
      return new TokenExpiredError(
        'Your YouTube session expired or could not be refreshed. Please reconnect YouTube.',
      );
    }
    return new TokenInvalidError('Google rejected the YouTube credentials. Please reconnect YouTube.');
  }

  if (reason === 'youtubesignuprequired') {
    return new InsufficientPermissionsError(
      'This Google account does not have a YouTube channel. Create one on YouTube, then reconnect.',
    );
  }

  if (
    reason === 'videonotfound' ||
    reason === 'playlistnotfound' ||
    reason === 'playlistitemnotfound' ||
    reason === 'notfound'
  ) {
    return new NotFoundError('This YouTube video or playlist was not found.');
  }

  if (
    reason === 'videoprivate' ||
    reason === 'playlistitemsnotaccessible' ||
    reason === 'videodeleted' ||
    /private|deleted|unavailable/i.test(message)
  ) {
    return new TrackUnavailableError(
      'This YouTube video is unavailable, private, or was deleted.',
    );
  }

  if (
    reason === 'forbidden' ||
    reason === 'insufficientpermissions' ||
    reason === 'permissiondenied'
  ) {
    return new InsufficientPermissionsError(
      'YouTube denied this action. Reconnect YouTube and grant playlist access.',
    );
  }

  if (status === 403) {
    return new InsufficientPermissionsError(
      'YouTube denied this action. Reconnect YouTube and grant playlist access.',
    );
  }

  if (status === 404) {
    return new TrackUnavailableError(
      'This YouTube video is unavailable, private, or was deleted.',
    );
  }

  if (status === 401) {
    return new TokenExpiredError();
  }

  if (typeof parsed?.error === 'string' && status >= 400) {
    return new OAuthFailedError('Google did not accept the YouTube authorization request.');
  }

  if (status >= 500) {
    return new NetworkError('YouTube is temporarily unavailable. Please try again later.');
  }

  return undefined;
}

export function isNonRetryableProviderError(error: unknown): boolean {
  return (
    error instanceof YouTubeQuotaExceededError ||
    (error instanceof AppError && error.code === ErrorCode.QUOTA_EXCEEDED)
  );
}
