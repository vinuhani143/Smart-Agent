import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateAiPlaylistSchema } from '../controllers/aiController';
import { createPlaylistSchema } from '../controllers/playlistController';
import { searchQuerySchema } from './schemas';

describe('searchQuerySchema', () => {
  it('rejects oversized queries and negative durations', () => {
    assert.equal(searchQuerySchema.safeParse({ q: 'a'.repeat(201) }).success, false);
    assert.equal(searchQuerySchema.safeParse({ q: 'telugu', durationMinMs: -1 }).success, false);
    assert.equal(searchQuerySchema.safeParse({ q: 'telugu', yearFrom: 1800 }).success, false);
    assert.equal(searchQuerySchema.safeParse({ q: 'telugu romantic' }).success, true);
  });
});

describe('strict command bodies', () => {
  it('rejects injected userId on playlist create (IDOR body injection)', () => {
    const result = createPlaylistSchema.safeParse({
      name: 'Night drive',
      userId: 'another-user',
    });
    assert.equal(result.success, false);
  });

  it('caps AI prompt length, provider enum, and maxTracks', () => {
    assert.equal(generateAiPlaylistSchema.safeParse({ prompt: 'ab' }).success, false);
    assert.equal(generateAiPlaylistSchema.safeParse({ prompt: 'Telugu romantic songs', maxTracks: 51 }).success, false);
    assert.equal(generateAiPlaylistSchema.safeParse({ prompt: 'Telugu romantic songs', provider: 'tidal' }).success, false);
    assert.equal(generateAiPlaylistSchema.safeParse({ prompt: 'Telugu romantic songs', maxTracks: 20 }).success, true);
  });
});
