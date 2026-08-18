import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertProductionConfig,
  assertProductionCors,
  assertProductionDatabaseUrl,
  assertProductionSafeUrls,
  corsOriginList,
} from './env';

describe('assertProductionSafeUrls', () => {
  it('allows localhost in development and test', () => {
    assert.doesNotThrow(() =>
      assertProductionSafeUrls({ NODE_ENV: 'development', API_PUBLIC_URL: 'http://localhost:4000' }),
    );
    assert.doesNotThrow(() =>
      assertProductionSafeUrls({ NODE_ENV: 'test', API_PUBLIC_URL: 'http://127.0.0.1:4000' }),
    );
  });

  it('rejects loopback and non-https production API origins', () => {
    assert.throws(
      () => assertProductionSafeUrls({ NODE_ENV: 'production', API_PUBLIC_URL: 'http://127.0.0.1:4000' }),
      /loopback/,
    );
    assert.throws(
      () => assertProductionSafeUrls({ NODE_ENV: 'production', API_PUBLIC_URL: 'http://api.internal' }),
      /https/,
    );
  });

  it('accepts an https production origin', () => {
    assert.doesNotThrow(() =>
      assertProductionSafeUrls({
        NODE_ENV: 'production',
        API_PUBLIC_URL: 'https://YOUR_PRODUCTION_BACKEND_DOMAIN',
      }),
    );
  });
});

describe('production CORS and database', () => {
  it('rejects wildcard and localhost CORS in production', () => {
    assert.throws(
      () =>
        assertProductionCors({
          NODE_ENV: 'production',
          CORS_ALLOWED_ORIGINS: '*',
          CORS_ORIGINS: '',
        }),
      /\*/,
    );
    assert.throws(
      () =>
        assertProductionCors({
          NODE_ENV: 'production',
          CORS_ALLOWED_ORIGINS: 'http://localhost:8081',
          CORS_ORIGINS: '',
        }),
      /localhost|http/,
    );
    assert.doesNotThrow(() =>
      assertProductionCors({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: '',
        CORS_ORIGINS: '',
      }),
    );
  });

  it('uses CORS_ALLOWED_ORIGINS over the legacy alias', () => {
    assert.deepEqual(
      corsOriginList({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://app.example',
        CORS_ORIGINS: 'https://ignored.example',
      }),
      ['https://app.example'],
    );
  });

  it('requires TLS on production DATABASE_URL without logging the URL', () => {
    assert.throws(
      () => assertProductionDatabaseUrl('postgresql://USER:PASSWORD@localhost:5432/musicmix', 'production'),
      /localhost/,
    );
    assert.throws(
      () => assertProductionDatabaseUrl('postgresql://USER:PASSWORD@db.example:5432/musicmix', 'production'),
      /TLS/,
    );
    assert.doesNotThrow(() =>
      assertProductionDatabaseUrl(
        'postgresql://USER:PASSWORD@db.example:5432/musicmix?sslmode=require',
        'production',
      ),
    );
  });

  it('rejects development JWT markers in production', () => {
    assert.throws(
      () =>
        assertProductionConfig({
          NODE_ENV: 'production',
          API_PUBLIC_URL: 'https://api.example',
          DATABASE_URL: 'postgresql://USER:PASSWORD@db.example:5432/musicmix?sslmode=require',
          CORS_ALLOWED_ORIGINS: '',
          CORS_ORIGINS: '',
          JWT_SECRET: 'test-jwt-secret-value-32chars-min',
          DEBUG_ERRORS: 'false',
        }),
      /JWT_SECRET/,
    );
  });
});
