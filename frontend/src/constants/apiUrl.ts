/** Hostnames used in docs/EAS until a real Render origin exists. Not a live API. */
const PLACEHOLDER_API_HOST =
  /YOUR[-_]?RENDER[-_]?SERVICE|YOUR[-_]?REAL[-_]?RENDER[-_]?URL|YOUR_PRODUCTION_BACKEND_DOMAIN|YOUR_REAL_BACKEND_DOMAIN/i;

export const API_NOT_CONFIGURED_MESSAGE =
  'MusicMix cannot reach its server. This install still uses a placeholder API address, so search, AI, and playlists will not work until you deploy the backend and rebuild the app with that HTTPS URL.';

export function isPlaceholderApiUrl(url: string): boolean {
  return PLACEHOLDER_API_HOST.test(url.trim());
}

export function isReleaseBuild(env: {
  nodeEnv?: string;
  devFlag?: boolean;
} = {}): boolean {
  if (typeof env.devFlag === 'boolean') {
    return env.devFlag === false;
  }
  return env.nodeEnv === 'production';
}

export function resolvePublicApiUrl(input: {
  value?: string | null;
  nodeEnv?: string;
  devFlag?: boolean;
}): string {
  const raw = input.value?.trim() ?? '';
  const release = isReleaseBuild({ nodeEnv: input.nodeEnv, devFlag: input.devFlag });

  if (release) {
    if (!raw) {
      throw new Error(
        'EXPO_PUBLIC_API_URL is required in production. Set it to your HTTPS API origin. Localhost is not allowed.',
      );
    }
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2/i.test(raw)) {
      throw new Error('EXPO_PUBLIC_API_URL cannot be a loopback address in production.');
    }
    if (!raw.startsWith('https://')) {
      throw new Error('EXPO_PUBLIC_API_URL must be an https URL in production.');
    }
    return raw.replace(/\/$/, '');
  }

  if (!raw) {
    if (input.nodeEnv === 'test') {
      return 'http://127.0.0.1:4000';
    }
    throw new Error(
      'Set EXPO_PUBLIC_API_URL explicitly (development example: http://127.0.0.1:4000). There is no silent localhost fallback.',
    );
  }
  return raw.replace(/\/$/, '');
}
