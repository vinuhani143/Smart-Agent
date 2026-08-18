import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../types/errors';
import { validateIntent } from './intentValidation';

describe('validateIntent', () => {
  it('accepts a grounded Telugu romantic intent', () => {
    const intent = validateIntent(
      {
        language: 'Telugu',
        mood: 'romantic',
        genre: 'melody',
        yearFrom: 1995,
        yearTo: 2010,
        durationMinutes: 120,
      },
      'Create a 2 hour Telugu romantic melody playlist from 1995 to 2010',
    );
    assert.equal(intent.durationMinutes, 120);
  });

  it('rejects an inverted year range', () => {
    assert.throws(
      () => validateIntent({ yearFrom: 2010, yearTo: 1995 }, 'songs from 2010 to 1995'),
      (error: unknown) => error instanceof AppError && error.statusCode === 400,
    );
  });

  it('rejects an empty prompt', () => {
    assert.throws(
      () => validateIntent({}, '  '),
      (error: unknown) => error instanceof AppError,
    );
  });

  it('rejects duration outside 1–600 minutes', () => {
    assert.throws(
      () => validateIntent({ durationMinutes: 0 }, 'zero minutes of music'),
      (error: unknown) => error instanceof AppError,
    );
  });

  it('rejects more than 50 tracks from the model or client', () => {
    assert.throws(
      () => validateIntent({ maxTracks: 80, language: 'Telugu' }, '80 Telugu songs'),
      (error: unknown) => error instanceof AppError,
    );
  });
});
