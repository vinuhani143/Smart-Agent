import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRemoteArtworkUrl } from './artwork';
import { ApiClientError, messageForHttpStatus, searchErrorPresentation, toUserMessage } from './errors';

describe('toUserMessage', () => {
  it('returns API error messages as written', () => {
    assert.equal(
      toUserMessage(new ApiClientError('Connect Spotify to search.', 401, 'UNAUTHORIZED')),
      'Connect Spotify to search.',
    );
  });

  it('uses the first line and does not show stack frames', () => {
    const err = new Error('Boom\n    at Handler.run (/app/server.js:12:3)');
    assert.equal(toUserMessage(err), 'Boom');
  });

  it('hides messages that are only stack frames', () => {
    const err = new Error('    at Handler.run (/app/server.js:12:3)');
    assert.equal(toUserMessage(err), 'Something went wrong. Please try again.');
  });
});

describe('messageForHttpStatus', () => {
  it('maps 401, 403, 404, 409, 429, 500, and 503 to user-safe copy', () => {
    assert.match(messageForHttpStatus(401, ''), /sign in|reconnect/i);
    assert.match(messageForHttpStatus(403, ''), /access/i);
    assert.match(messageForHttpStatus(404, ''), /not found/i);
    assert.match(messageForHttpStatus(409, ''), /already/i);
    assert.match(messageForHttpStatus(429, ''), /too many/i);
    assert.match(messageForHttpStatus(500, ''), /try again/i);
    assert.match(messageForHttpStatus(503, ''), /unavailable/i);
    assert.match(messageForHttpStatus(400, ''), /failed/i);
    assert.match(messageForHttpStatus(502, ''), /try again/i);
    assert.equal(messageForHttpStatus(401, 'Reconnect Spotify.'), 'Reconnect Spotify.');
  });
});

describe('searchErrorPresentation', () => {
  it('distinguishes Spotify reconnect, decrypt, invalid token, rate limit, and server errors', () => {
    assert.equal(
      searchErrorPresentation(new ApiClientError('Reconnect Spotify.', 401, 'SPOTIFY_RECONNECT_REQUIRED')).title,
      'Reconnect required',
    );
    assert.equal(
      searchErrorPresentation(new ApiClientError('Reconnect Spotify.', 401, 'SPOTIFY_TOKEN_DECRYPT_FAILED')).title,
      'Reconnect required',
    );
    assert.equal(
      searchErrorPresentation(
        new ApiClientError('Spotify rejected the access token. Reconnect Spotify.', 401, 'SPOTIFY_INVALID_TOKEN'),
      ).title,
      'Reconnect required',
    );
    assert.equal(
      searchErrorPresentation(
        new ApiClientError('The music service is temporarily limiting requests.', 429, 'RATE_LIMITED'),
      ).title,
      'Too many requests',
    );
    assert.equal(
      searchErrorPresentation(
        new ApiClientError('Spotify is temporarily unavailable. Try again.', 503, 'SPOTIFY_SERVER_ERROR'),
      ).title,
      'Spotify is unavailable',
    );
  });

  it('does not show the generic rejected-request copy for structured Spotify codes', () => {
    const presented = searchErrorPresentation(
      new ApiClientError(
        'The music service rejected the request. Please reconnect the account.',
        401,
        'SPOTIFY_RECONNECT_REQUIRED',
      ),
    );
    assert.equal(presented.title, 'Reconnect required');
    assert.equal(presented.message, 'Reconnect Spotify.');
    assert.equal(presented.message.includes('rejected the request'), false);
  });
});

describe('isRemoteArtworkUrl', () => {
  it('allows http(s) artwork and rejects invalid or script URLs', () => {
    assert.equal(isRemoteArtworkUrl('https://i.scdn.co/image/ab'), true);
    assert.equal(isRemoteArtworkUrl('http://example.com/art.jpg'), true);
    assert.equal(isRemoteArtworkUrl('javascript:alert(1)'), false);
    assert.equal(isRemoteArtworkUrl('file:///etc/passwd'), false);
    assert.equal(isRemoteArtworkUrl('not a url'), false);
    assert.equal(isRemoteArtworkUrl(undefined), false);
  });
});
