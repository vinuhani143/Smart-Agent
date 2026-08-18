import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiClientError, toUserMessage } from './errors';

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
