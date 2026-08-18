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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
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
});

export type Env = z.infer<typeof envSchema>;

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

  cached = parsed.data;
  return cached;
}

export function getEnv(): Env {
  return loadEnv();
}

export function corsOriginList(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
