import {
  AppError,
  ErrorCode,
  InsufficientPermissionsError,
  NetworkError,
  NotFoundError,
  OAuthFailedError,
  ProviderUnavailableError,
  RateLimitedError,
  TokenExpiredError,
} from '../../types/errors';
import { AMAZON_MUSIC_UNAVAILABLE_MESSAGE } from './amazonConfig';

export interface AmazonErrorBody {
  error?: {
    status?: string | number;
    code?: string;
    message?: string;
    url?: string;
    reference?: string;
    payload?: unknown;
  };
  error_description?: string;
  error_index?: string;
}

export function asAmazonErrorBody(value: unknown): AmazonErrorBody | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as AmazonErrorBody;
}

export function userSafeAmazonMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'THROTTLED':
      return 'Amazon Music is temporarily limiting requests. Please wait a moment and try again.';
    case 'INVALID_ACCESS_TOKEN':
    case 'NO_ACCESS_TOKEN':
    case 'INVALID_AUTH_TYPE':
      return 'Your Amazon Music session expired. Please reconnect the account.';
    case 'INVALID_CLIENT_ID':
    case 'NO_X_API_KEY':
      return 'Amazon Music API access was denied. Check AMAZON_MUSIC_SECURITY_PROFILE_ID and Amazon closed-beta approval.';
    case 'NO_MUSIC_ACCOUNT_FOUND':
    case 'AUTH_NO_MUSIC_ACCOUNT_FOUND':
      return 'No Amazon Music account was found for this Login With Amazon profile.';
    case 'DENIED_SUBSCRIPTION_TIER':
      return 'This Amazon Music action is not available on the current subscription tier.';
    case 'RESOURCE_NOT_FOUND':
      return 'That Amazon Music item was not found.';
    case 'BAD_REQUEST':
      return 'Amazon Music rejected the request.';
    default:
      return fallback;
  }
}

export function mapAmazonApiError(
  status: number,
  body: unknown,
  retryAfterSeconds?: number,
): AppError | undefined {
  const parsed = asAmazonErrorBody(body);
  const code = parsed?.error?.code ?? (typeof parsed?.error === 'string' ? parsed.error : undefined);
  const lwaError = typeof parsed?.error === 'string' ? parsed.error : undefined;

  if (lwaError === 'invalid_scope' || code === 'INVALID_CLIENT_ID' || code === 'NO_X_API_KEY') {
    return new ProviderUnavailableError(
      'amazon_music',
      'Amazon Music API access was denied. The Security Profile must be enabled by Amazon Music (closed beta).',
    );
  }
  if (lwaError === 'access_denied') {
    return new OAuthFailedError('Amazon Music connection was cancelled.');
  }
  if (lwaError === 'invalid_grant' || lwaError === 'unauthorized_client') {
    return new OAuthFailedError('Amazon Music did not accept the authorization code.');
  }

  if (status === 429 || code === 'THROTTLED') {
    return new RateLimitedError(retryAfterSeconds);
  }
  if (status === 401 || code === 'INVALID_ACCESS_TOKEN' || code === 'NO_ACCESS_TOKEN' || code === 'INVALID_AUTH_TYPE') {
    return new TokenExpiredError(userSafeAmazonMessage(code, 'Your Amazon Music session expired. Please reconnect the account.'));
  }
  if (status === 403 || code === 'NO_MUSIC_ACCOUNT_FOUND' || code === 'DENIED_SUBSCRIPTION_TIER' || code === 'AUTH_NO_MUSIC_ACCOUNT_FOUND') {
    return new InsufficientPermissionsError(
      userSafeAmazonMessage(code, 'Amazon Music denied this request. Check subscription tier and API access.'),
    );
  }
  if (status === 404 || code === 'RESOURCE_NOT_FOUND') {
    return new NotFoundError(userSafeAmazonMessage(code, 'That Amazon Music item was not found.'));
  }
  if (status === 400 || code === 'BAD_REQUEST') {
    return new AppError(ErrorCode.VALIDATION_ERROR, userSafeAmazonMessage(code, 'Amazon Music rejected the request.'), 400);
  }
  if (status >= 500 || code === 'INTERNAL') {
    return new NetworkError('Amazon Music is temporarily unavailable. Try again later.');
  }
  return undefined;
}

export function amazonDisabledError(): ProviderUnavailableError {
  return new ProviderUnavailableError('amazon_music', AMAZON_MUSIC_UNAVAILABLE_MESSAGE);
}

export function isAmazonApiAccessDenied(error: unknown): boolean {
  return (
    error instanceof ProviderUnavailableError &&
    error.message.includes('closed beta')
  );
}
