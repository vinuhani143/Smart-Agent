export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export function messageForHttpStatus(status: number, fallback: string): string {
  if (status === 401) {
    return fallback || 'Please sign in again or reconnect the music service.';
  }
  if (status === 403) {
    return fallback || 'You do not have access to this.';
  }
  if (status === 404) {
    return fallback || 'That item was not found.';
  }
  if (status === 409) {
    return fallback || 'This action was already completed.';
  }
  if (status === 429) {
    return fallback || 'Too many requests. Please wait a moment and try again.';
  }
  if (status === 503) {
    return fallback || 'The service is temporarily unavailable. Try again later.';
  }
  if (status >= 500) {
    return fallback || 'Something went wrong. Please try again.';
  }
  return fallback || 'Request failed.';
}

export function toUserMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (/the music service rejected the request/i.test(error.message)) {
      return messageForSpotifyCode(error.code) ?? 'Reconnect Spotify.';
    }
    return error.message;
  }
  if (error instanceof Error) {
    const firstLine = error.message.split('\n')[0]?.trim() ?? '';
    if (!firstLine || firstLine.length > 240 || /at\s+\S+\s+\(/.test(firstLine)) {
      return 'Something went wrong. Please try again.';
    }
    return firstLine;
  }
  return 'Something went wrong. Please try again.';
}

function messageForSpotifyCode(code: string): string | undefined {
  switch (code) {
    case 'SPOTIFY_RECONNECT_REQUIRED':
    case 'SPOTIFY_TOKEN_DECRYPT_FAILED':
      return 'Reconnect Spotify.';
    case 'SPOTIFY_INVALID_TOKEN':
      return 'Spotify rejected the access token. Reconnect Spotify.';
    case 'TOKEN_EXPIRED':
      return 'Your Spotify session expired. Please reconnect the account.';
    case 'RATE_LIMITED':
      return 'The music service is temporarily limiting requests. Please wait a moment and try again.';
    case 'SPOTIFY_SERVER_ERROR':
      return 'Spotify is temporarily unavailable. Try again.';
    default:
      return undefined;
  }
}

export function searchErrorPresentation(error: unknown): { title: string; message: string } {
  const message = toUserMessage(error);
  if (!(error instanceof ApiClientError)) {
    return { title: 'Search failed', message };
  }
  switch (error.code) {
    case 'SPOTIFY_RECONNECT_REQUIRED':
    case 'SPOTIFY_TOKEN_DECRYPT_FAILED':
    case 'SPOTIFY_INVALID_TOKEN':
    case 'TOKEN_INVALID':
    case 'TOKEN_EXPIRED':
      return { title: 'Reconnect required', message };
    case 'RATE_LIMITED':
      return { title: 'Too many requests', message };
    case 'SPOTIFY_SERVER_ERROR':
      return { title: 'Spotify is unavailable', message };
    default:
      if (error.status === 401) {
        return { title: 'Reconnect required', message };
      }
      return { title: 'Search failed', message };
  }
}
