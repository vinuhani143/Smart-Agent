export const AMAZON_MUSIC_UNAVAILABLE_MESSAGE =
  'Amazon Music integration is currently unavailable because Amazon Music API access has not been configured.';

export const AMAZON_MUSIC_CLOSED_BETA_NOTE =
  'Amazon Music Web API access is subject to Amazon approval. The application does not bypass or work around Amazon\'s access restrictions.';

export const AMAZON_MUSIC_DEFAULT_API_BASE = 'https://api.music.amazon.dev';
export const LWA_AUTHORIZE_URL = 'https://www.amazon.com/ap/oa';
export const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
export const LWA_REVOKE_URL = 'https://api.amazon.com/auth/o2/token/revoke';

/**
 * Official Amazon Music Web API scopes.
 * `music::library` includes playlist read/write and supersedes `music::library:read`.
 */
export const AMAZON_MUSIC_SCOPES = ['music::profile', 'music::catalog', 'music::library'] as const;

export const AMAZON_MUSIC_SCOPE_STRING = AMAZON_MUSIC_SCOPES.join(' ');

export const AMAZON_MUSIC_DOCS_URL = 'https://developer.amazon.com/docs/music/API_web_overview.html';

export type AmazonAccessStatus =
  | 'disabled'
  | 'not_configured'
  | 'configured'
  | 'authenticated'
  | 'api_access_denied'
  | 'closed_beta';

export interface AmazonRuntimeConfig {
  featureEnabled: boolean;
  clientId: string;
  clientSecret: string;
  securityProfileId: string;
  redirectUri: string;
  apiBaseUrl: string;
}

export function parseEnabledFlag(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function credentialsConfigured(config: Pick<AmazonRuntimeConfig, 'clientId' | 'clientSecret' | 'securityProfileId' | 'redirectUri'>): boolean {
  return Boolean(
    config.clientId.trim() &&
      config.clientSecret.trim() &&
      config.securityProfileId.trim() &&
      config.redirectUri.trim(),
  );
}

export function isAmazonMusicUsable(config: AmazonRuntimeConfig): boolean {
  return config.featureEnabled && credentialsConfigured(config);
}

/**
 * Feature-flag + credential snapshot. `api_access_denied` is a runtime OAuth/API
 * outcome, not a default boot state.
 */
export function resolveAmazonAccessStatus(input: {
  featureEnabled: boolean;
  credentialsConfigured: boolean;
  authenticated: boolean;
  apiAccessDenied?: boolean;
}): AmazonAccessStatus {
  if (input.apiAccessDenied) {
    return 'api_access_denied';
  }
  if (!input.featureEnabled) {
    return input.credentialsConfigured ? 'disabled' : 'closed_beta';
  }
  if (!input.credentialsConfigured) {
    return 'not_configured';
  }
  if (input.authenticated) {
    return 'authenticated';
  }
  return 'configured';
}

export function amazonUnavailableMessage(status: AmazonAccessStatus): string {
  if (status === 'api_access_denied') {
    return 'Amazon Music API access was denied. The Security Profile must be enabled by Amazon Music (closed beta).';
  }
  if (status === 'not_configured') {
    return AMAZON_MUSIC_UNAVAILABLE_MESSAGE;
  }
  return AMAZON_MUSIC_UNAVAILABLE_MESSAGE;
}

export function buildAmazonFeatureStatus(input: {
  featureEnabled: boolean;
  credentialsConfigured: boolean;
  authenticated: boolean;
  apiAccessDenied?: boolean;
}): {
  enabled: boolean;
  configured: boolean;
  accessStatus: AmazonAccessStatus;
} {
  return {
    enabled: input.featureEnabled && input.credentialsConfigured,
    configured: input.credentialsConfigured,
    accessStatus: resolveAmazonAccessStatus(input),
  };
}
