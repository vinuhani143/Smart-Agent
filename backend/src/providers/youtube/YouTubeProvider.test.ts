process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);
process.env.GOOGLE_CLIENT_ID = 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:4000/api/auth/google/callback';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { resetEnvCache } from '../../config/env';
import { ErrorCode, OperationNotSupportedError } from '../../types/errors';
import { YouTubeProvider } from './YouTubeProvider';
import { isNonRetryableProviderError, mapGoogleApiError } from './youtubeErrors';
import { YouTubeQuotaExceededError } from '../../types/errors';

before(() => {
  resetEnvCache();
});

describe('YouTubeProvider reorder', () => {
  const provider = new YouTubeProvider();

  it('is enabled when Google OAuth is configured', () => {
    assert.equal(provider.isEnabled(), true);
  });

  it('builds a Google authorize URL without the client secret', () => {
    const { authorizationUrl } = provider.getAuthorizationUrl('yt-state', 'challenge');
    const url = new URL(authorizationUrl);
    assert.equal(url.searchParams.get('client_id'), 'google-client-id');
    assert.equal(url.searchParams.has('client_secret'), false);
    assert.equal(authorizationUrl.includes('google-client-secret'), false);
    assert.equal(url.searchParams.get('code_challenge'), 'challenge');
  });

  it('rejects multi-item reorder to avoid partial quota-expensive updates', async () => {
    await assert.rejects(
      () =>
        provider.reorderPlaylist(
          { accessToken: 'ya29.access' },
          'PL123',
          { rangeStart: 0, insertBefore: 3, rangeLength: 2 },
        ),
      (error: unknown) =>
        error instanceof OperationNotSupportedError && error.code === ErrorCode.NOT_SUPPORTED,
    );
  });
});

describe('YouTube quota handling', () => {
  it('does not treat quota exceeded as retryable', () => {
    const error = mapGoogleApiError(403, {
      error: {
        code: 403,
        message: 'The request cannot be completed because you have exceeded your quota.',
        errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota' }],
      },
    });
    assert.ok(error instanceof YouTubeQuotaExceededError);
    assert.equal(isNonRetryableProviderError(error), true);
    assert.equal(error?.details?.retry, false);
  });
});
