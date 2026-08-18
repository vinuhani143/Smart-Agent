import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractLiteralIntent,
  intentFromUnknown,
  isUnsafePlaylistPrompt,
  mergeGroundedIntent,
} from './intentParser';

describe('extractLiteralIntent', () => {
  it('parses a 2 hour Telugu romantic melody request', () => {
    const intent = extractLiteralIntent(
      'Create a 2 hour Telugu romantic melody playlist from 1995 to 2010 without duplicate songs.',
    );
    assert.equal(intent.language, 'Telugu');
    assert.equal(intent.mood, 'romantic');
    assert.equal(intent.genre, 'melody');
    assert.equal(intent.yearFrom, 1995);
    assert.equal(intent.yearTo, 2010);
    assert.equal(intent.durationMinutes, 120);
    assert.equal(intent.allowDuplicates, false);
  });

  it('parses workout duration and high energy from text', () => {
    const intent = extractLiteralIntent('High-energy songs for a 45 minute workout');
    assert.equal(intent.durationMinutes, 45);
    assert.equal(intent.mood, 'workout');
    assert.equal(intent.theme, 'workout');
    assert.equal(intent.energyLevel, 'high');
  });

  it('parses 90s Telugu evergreen songs', () => {
    const intent = extractLiteralIntent('90s Telugu evergreen songs');
    assert.equal(intent.language, 'Telugu');
    assert.equal(intent.genre, 'evergreen');
    assert.equal(intent.yearFrom, 1990);
    assert.equal(intent.yearTo, 1999);
  });

  it('parses night drive relaxing English songs', () => {
    const intent = extractLiteralIntent('Relaxing English songs for a night drive');
    assert.equal(intent.language, 'English');
    assert.equal(intent.mood, 'relaxing');
    assert.equal(intent.theme, 'night_drive');
    assert.equal(intent.energyLevel, 'low');
  });

  it('extracts Ilaiyaraaja as artist', () => {
    const intent = extractLiteralIntent('Ilaiyaraaja Telugu melodies');
    assert.equal(intent.language, 'Telugu');
    assert.equal(intent.genre, 'melody');
    assert.match(intent.artist ?? '', /ilaiyaraaja/i);
  });

  it('does not invent a year that is not in the prompt', () => {
    const intent = extractLiteralIntent('Telugu romantic melody playlist');
    assert.equal(intent.yearFrom, undefined);
    assert.equal(intent.yearTo, undefined);
  });
});

describe('mergeGroundedIntent', () => {
  it('rejects LLM years that are not in the prompt', () => {
    const prompt = 'Telugu romantic songs';
    const merged = mergeGroundedIntent(prompt, extractLiteralIntent(prompt), {
      yearFrom: 1995,
      yearTo: 2010,
      language: 'Spanish',
    });
    assert.equal(merged.yearFrom, undefined);
    assert.equal(merged.yearTo, undefined);
    assert.equal(merged.language, 'Telugu');
  });

  it('accepts LLM fields that appear in the prompt', () => {
    const prompt = 'Create a Telugu romantic playlist from 1995 to 2010';
    const merged = mergeGroundedIntent(prompt, {}, intentFromUnknown({
      language: 'Telugu',
      mood: 'romantic',
      yearFrom: 1995,
      yearTo: 2010,
    }));
    assert.equal(merged.language, 'Telugu');
    assert.equal(merged.mood, 'romantic');
    assert.equal(merged.yearFrom, 1995);
    assert.equal(merged.yearTo, 2010);
  });
});

describe('safety', () => {
  it('flags download/rip requests', () => {
    assert.equal(isUnsafePlaylistPrompt('download mp3 torrent of Telugu hits'), true);
    assert.equal(isUnsafePlaylistPrompt('Create a 2 hour Telugu romantic playlist'), false);
  });
});
