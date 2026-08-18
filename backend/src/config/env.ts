import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const envFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const file of envFiles) {
  if (existsSync(file)) {
    loadDotenv({ path: file, override: false });
  }
}

/**
 * Render and similar hosts often omit sslmode on DATABASE_URL while still requiring TLS.
 * Mutate process.env before PrismaClient is constructed. Never log the URL.
 */
export function withProductionTls(databaseUrl: string): string {
  const url = databaseUrl.trim();
  if (!url) {
    return url;
  }
  if (/sslmode=|[?&]ssl=true/i.test(url)) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}sslmode=require`;
}

export function applyProductionDatabaseTls(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const current = process.env.DATABASE_URL;
  if (!current) {
    return;
  }
  process.env.DATABASE_URL = withProductionTls(current);
}

applyProductionDatabaseTls();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  /** Canonical production CORS list. Native Android does not use CORS. Never set to *. */
  CORS_ALLOWED_ORIGINS: z.string().optional().default(''),
  /** Legacy alias. Used when CORS_ALLOWED_ORIGINS is empty. */
  CORS_ORIGINS: z.string().optional().default(''),
  APP_DEEP_LINK: z.string().min(1).default('musicmix://auth/callback'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
  DEBUG_ERRORS: z.string().optional().default('false'),
  SPOTIFY_CLIENT_ID: z.string().optional().default(''),
  SPOTIFY_CLIENT_SECRET: z.string().optional().default(''),
  SPOTIFY_REDIRECT_URI: z.string().optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().optional().default(''),
  YOUTUBE_API_KEY: z.string().optional().default(''),
  AMAZON_MUSIC_CLIENT_ID: z.string().optional().default(''),
  AMAZON_MUSIC_CLIENT_SECRET: z.string().optional().default(''),
  AMAZON_MUSIC_REDIRECT_URI: z.string().optional().default(''),
  AMAZON_MUSIC_ENABLED: z.string().optional().default('false'),
  AMAZON_MUSIC_API_BASE_URL: z.string().optional().default('https://api.music.amazon.dev'),
  AMAZON_LWA_CLIENT_ID: z.string().optional().default(''),
  AMAZON_LWA_CLIENT_SECRET: z.string().optional().default(''),
  AMAZON_MUSIC_SECURITY_PROFILE_ID: z.string().optional().default(''),
  AI_PROVIDER: z.string().optional().default(''),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default(''),
  AI_BASE_URL: z.string().optional().default(''),
  /** Header secret for POST /api/internal/remote-operations/:id/cleanup. Never send to the app. */
  INTERNAL_CLEANUP_KEY: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

const LOOPBACK = /localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2/i;
const TEST_JWT_MARKERS = /test-jwt-secret|changeme|password|dev-secret|local-secret/i;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  assertProductionConfig(parsed.data);
  cached = parsed.data;
  return cached;
}

export function corsOriginList(env: Pick<Env, 'CORS_ALLOWED_ORIGINS' | 'CORS_ORIGINS' | 'NODE_ENV'>): string[] {
  const preferred = env.CORS_ALLOWED_ORIGINS?.trim() ?? '';
  const legacy = env.CORS_ORIGINS?.trim() ?? '';
  const raw = preferred || legacy;
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      return [];
    }
    return ['http://localhost:8081', 'http://localhost:19006'];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Production API origin must be HTTPS and must not be loopback. */
export function assertProductionSafeUrls(env: Pick<Env, 'NODE_ENV' | 'API_PUBLIC_URL'>): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  const url = env.API_PUBLIC_URL.trim();
  if (LOOPBACK.test(url)) {
    throw new Error('API_PUBLIC_URL cannot be a loopback address in production.');
  }
  if (!url.startsWith('https://')) {
    throw new Error('API_PUBLIC_URL must be an https URL in production.');
  }
}

export function assertProductionDatabaseUrl(databaseUrl: string, nodeEnv: Env['NODE_ENV']): void {
  if (nodeEnv !== 'production') {
    return;
  }
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a postgresql:// connection string in production.');
  }
  if (LOOPBACK.test(databaseUrl)) {
    throw new Error('DATABASE_URL cannot point at localhost in production.');
  }
  if (!/sslmode=(require|verify-full)|[?&]ssl=true/i.test(databaseUrl)) {
    throw new Error('DATABASE_URL must enable TLS in production (sslmode=require or sslmode=verify-full).');
  }
}

export function assertProductionCors(env: Pick<Env, 'NODE_ENV' | 'CORS_ALLOWED_ORIGINS' | 'CORS_ORIGINS'>): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  const origins = corsOriginList(env);
  if (origins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS cannot be * in production.');
  }
  if (origins.some((origin) => LOOPBACK.test(origin) || origin.startsWith('http://'))) {
    throw new Error('CORS_ALLOWED_ORIGINS cannot include localhost or http origins in production.');
  }
}

export function assertProductionSecrets(env: Pick<Env, 'NODE_ENV' | 'JWT_SECRET' | 'DEBUG_ERRORS'>): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  if (TEST_JWT_MARKERS.test(env.JWT_SECRET)) {
    throw new Error('JWT_SECRET looks like a development or test value. Generate a production secret.');
  }
  if (env.DEBUG_ERRORS === 'true') {
    throw new Error('DEBUG_ERRORS must be false in production.');
  }
}

/** Fail closed in production: no development URL/CORS/secret fallbacks. */
export function assertProductionConfig(
  env: Pick<
    Env,
    | 'NODE_ENV'
    | 'API_PUBLIC_URL'
    | 'DATABASE_URL'
    | 'CORS_ALLOWED_ORIGINS'
    | 'CORS_ORIGINS'
    | 'JWT_SECRET'
    | 'DEBUG_ERRORS'
  >,
): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  assertProductionSafeUrls(env);
  assertProductionDatabaseUrl(env.DATABASE_URL, env.NODE_ENV);
  assertProductionCors(env);
  assertProductionSecrets(env);
}

export function getEnv(): Env {
  return loadEnv();
}

/** Test-only: drop the cached parse so later process.env changes are picked up. */
export function resetEnvCache(): void {
  cached = undefined;
}
