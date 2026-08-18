import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractLiteralIntent, isUnsafePlaylistPrompt } from './intentParser';
import { assertGenerateDoesNotCreate, assertReadyToCreate, fewTracksWarning } from './generationRules';
import { ConflictError } from '../types/errors';

describe('AI playlist prompt scenarios', () => {
  it('parses 90s Telugu hits', () => {
    const intent = extractLiteralIntent('90s Telugu hits');
    assert.equal(intent.language, 'Telugu');
    assert.equal(intent.genre, 'hits');
    assert.equal(intent.yearFrom, 1990);
    assert.equal(intent.yearTo, 1999);
  });

  it('parses a 2 hour Telugu romantic melodies request', () => {
    const intent = extractLiteralIntent('2 hour Telugu romantic melodies');
    assert.equal(intent.language, 'Telugu');
    assert.equal(intent.mood, 'romantic');
    assert.equal(intent.genre, 'melody');
    assert.equal(intent.durationMinutes, 120);
  });

  it('parses a 60 minute workout playlist', () => {
    const intent = extractLiteralIntent('60 minute workout playlist');
    assert.equal(intent.durationMinutes, 60);
    assert.equal(intent.mood, 'workout');
  });

  it('parses relaxing English songs', () => {
    const intent = extractLiteralIntent('Relaxing English songs');
    assert.equal(intent.language, 'English');
    assert.equal(intent.mood, 'relaxing');
  });

  it('parses a night drive playlist', () => {
    const intent = extractLiteralIntent('Night drive playlist');
    assert.equal(intent.theme, 'night_drive');
  });
});

describe('AI confirmation and empty results', () => {
  it('never treats generate as create', () => {
    assert.doesNotThrow(() => assertGenerateDoesNotCreate('GENERATED'));
    assert.throws(() => assertGenerateDoesNotCreate('CREATED'));
  });

  it('requires explicit confirmation and refuses a second create', () => {
    assert.doesNotThrow(() => assertReadyToCreate('GENERATED', 12));
    assert.throws(() => assertReadyToCreate('CREATED', 12), ConflictError);
    assert.throws(() => assertReadyToCreate('GENERATED', 0));
  });

  it('warns when too few songs are found and does not invent tracks', () => {
    assert.equal(fewTracksWarning(0), 'Only 0 suitable songs were found.');
    assert.equal(fewTracksWarning(3, 20), 'Only 3 suitable songs were found.');
  });

  it('does not treat a normal prompt as download or injection', () => {
    assert.equal(isUnsafePlaylistPrompt('2 hour Telugu romantic melodies'), false);
  });
});
