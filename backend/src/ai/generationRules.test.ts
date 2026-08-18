import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError, ConflictError, NoSearchResultsError, ProviderUnavailableError, TokenInvalidError, YouTubeQuotaExceededError } from '../types/errors';
import {
  assertReadyToCreate,
  classifySearchError,
  durationShortageWarning,
  fewTracksWarning,
  userSafeAiMessage,
} from './generationRules';
import { buildSearchQueries } from './searchQueries';

describe('no-result handling', () => {
  it('tells the user when zero songs were found', () => {
    assert.equal(fewTracksWarning(0), 'Only 0 suitable songs were found.');
  });

  it('tells the user when fewer songs were found than requested', () => {
    assert.equal(fewTracksWarning(4, 20), 'Only 4 suitable songs were found.');
  });

  it('warns when actual duration is short of the target', () => {
    assert.equal(durationShortageWarning(8, 40, 120), 'Only 8 suitable songs were found.');
    assert.equal(durationShortageWarning(30, 119, 120), null);
  });
});

describe('AI failure handling', () => {
  it('maps AI HTTP failures to setup/rate-limit messages without leaking secrets', () => {
    assert.match(userSafeAiMessage(401), /AI_API_KEY/);
    assert.match(userSafeAiMessage(429), /rate limit/i);
    assert.match(userSafeAiMessage(503), /unavailable/i);
    assert.equal(userSafeAiMessage(401).includes('sk-'), false);
  });
});

describe('provider failure handling', () => {
  it('classifies empty search, expired OAuth, and YouTube quota separately', () => {
    assert.equal(classifySearchError(new NoSearchResultsError('telugu')), 'empty');
    assert.equal(classifySearchError(new TokenInvalidError()), 'fatal');
    assert.equal(classifySearchError(new YouTubeQuotaExceededError()), 'soft');
    assert.equal(
      classifySearchError(
        new ProviderUnavailableError(
          'amazon_music',
          'Amazon Music integration is currently unavailable because Amazon Music API access has not been configured.',
        ),
      ),
      'soft',
    );
  });
});

describe('confirmation requirement', () => {
  it('refuses to create from a failed or empty generation', () => {
    assert.throws(() => assertReadyToCreate('FAILED', 0), (error: unknown) => error instanceof AppError);
    assert.throws(() => assertReadyToCreate('GENERATED', 0), (error: unknown) => error instanceof AppError);
  });

  it('refuses a second create after CREATED', () => {
    assert.throws(() => assertReadyToCreate('CREATED', 10), (error: unknown) => error instanceof ConflictError);
  });

  it('treats generate statuses as not yet created', () => {
    assert.doesNotThrow(() => assertReadyToCreate('GENERATED', 12));
    assert.doesNotThrow(() => assertReadyToCreate('EDITED', 12));
  });
});

describe('search query strategy', () => {
  it('builds a bounded set of Telugu romantic queries', () => {
    const queries = buildSearchQueries(
      { language: 'Telugu', mood: 'romantic', genre: 'melody', yearFrom: 1995, yearTo: 2010 },
      'Create a 2 hour Telugu romantic melody playlist from 1995 to 2010',
    );
    assert.ok(queries.length > 0 && queries.length <= 6);
    assert.ok(queries.some((query) => /telugu/i.test(query) && /romantic/i.test(query)));
  });
});
