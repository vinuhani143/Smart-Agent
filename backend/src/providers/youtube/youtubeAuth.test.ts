import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '../../types/errors';
import {
  buildYouTubePlaylistInsertBody,
  mapGoogleTokenResponse,
  youtubeInsertPosition,
} from './youtubeAuth';

describe('mapGoogleTokenResponse', () => {
  it('maps a successful token payload', () => {
    const tokens = mapGoogleTokenResponse({
      access_token: 'ya29.access',
      expires_in: 3600,
      refresh_token: '1//refresh',
      scope: 'https://www.googleapis.com/auth/youtube',
      token_type: 'Bearer',
    });
    assert.equal(tokens.accessToken, 'ya29.access');
    assert.equal(tokens.refreshToken, '1//refresh');
    assert.ok(tokens.expiresAt && tokens.expiresAt.getTime() > Date.now());
  });

  it('keeps the previous refresh token when Google omits a new one', () => {
    const tokens = mapGoogleTokenResponse(
      { access_token: 'ya29.new', expires_in: 3600, token_type: 'Bearer' },
      '1//existing',
    );
    assert.equal(tokens.refreshToken, '1//existing');
  });

  it('fails refresh with a reconnect message', () => {
    assert.throws(
      () => mapGoogleTokenResponse({ error: 'invalid_grant', error_description: 'expired' }),
      (error: Error & { code?: string }) => error.code === ErrorCode.TOKEN_INVALID,
    );
  });

  it('fails authorization-code errors without exposing secrets', () => {
    assert.throws(
      () => mapGoogleTokenResponse({ error: 'invalid_client' }),
      (error: Error) => !/secret|ya29|1\/\//i.test(error.message),
    );
  });
});

describe('YouTube playlist create request', () => {
  it('builds the official playlists.insert body', () => {
    const body = buildYouTubePlaylistInsertBody({
      name: 'Telugu melody',
      description: '1995-2010',
      isPublic: false,
    });
    assert.deepEqual(body, {
      snippet: { title: 'Telugu melody', description: '1995-2010' },
      status: { privacyStatus: 'private' },
    });
  });
});

describe('youtubeInsertPosition', () => {
  it('maps Spotify-style insertBefore to a YouTube position', () => {
    assert.equal(youtubeInsertPosition(2, 0), 0);
    assert.equal(youtubeInsertPosition(0, 4), 3);
  });
});
