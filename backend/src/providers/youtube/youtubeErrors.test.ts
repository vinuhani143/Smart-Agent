import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import { mapGoogleApiError } from './youtubeErrors';

describe('mapGoogleApiError', () => {
  it('maps quotaExceeded without retry', () => {
    const error = mapGoogleApiError(403, {
      error: {
        code: 403,
        message: 'The request cannot be completed because you have exceeded your quota.',
        errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota' }],
      },
    });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.QUOTA_EXCEEDED);
    assert.equal(error.message, 'YouTube search quota has been exceeded. Please try again later.');
    assert.equal(error.details?.retry, false);
  });

  it('maps expired tokens', () => {
    const error = mapGoogleApiError(401, {
      error: 'invalid_grant',
      error_description: 'Token has been expired or revoked.',
    });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.TOKEN_EXPIRED);
  });

  it('maps invalid credentials', () => {
    const error = mapGoogleApiError(401, { error: 'invalid_token' });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.TOKEN_INVALID);
  });

  it('maps 404 unavailable videos', () => {
    const error = mapGoogleApiError(404, {
      error: { errors: [{ reason: 'videoNotFound' }] },
    });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.NOT_FOUND);
  });

  it('maps private/deleted videos', () => {
    const error = mapGoogleApiError(403, {
      error: { message: 'The video is private.', errors: [{ reason: 'videoPrivate' }] },
    });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.TRACK_UNAVAILABLE);
  });

  it('maps 403 permission errors', () => {
    const error = mapGoogleApiError(403, {
      error: { errors: [{ reason: 'forbidden' }] },
    });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('maps OAuth cancellation', () => {
    const error = mapGoogleApiError(400, { error: 'access_denied' });
    assert.ok(error);
    assert.equal(error.code, ErrorCode.OAUTH_CANCELLED);
  });

  it('does not treat Spotify-shaped errors as YouTube errors', () => {
    const error = mapGoogleApiError(401, {
      error: { status: 401, message: 'The access token expired' },
    });
    assert.equal(error, undefined);
  });
});
