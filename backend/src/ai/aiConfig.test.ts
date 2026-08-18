process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);
process.env.DATABASE_URL ??= 'postgresql://USER:PASSWORD@localhost:5432/musicmix?schema=public';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeAiConfig, requireAiConfig } from './configurableLlmProvider';
import { AiUnavailableError } from '../types/errors';

describe('AI provider configuration', () => {
  it('is unconfigured when AI secrets are empty and does not invent a provider', () => {
    const status = describeAiConfig();
    assert.equal(status.configured, false);
    assert.equal(status.apiKeyConfigured, false);
  });

  it('refuses generation setup without credentials', () => {
    assert.throws(() => requireAiConfig(), AiUnavailableError);
  });
});
