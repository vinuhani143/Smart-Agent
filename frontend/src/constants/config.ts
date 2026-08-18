import { resolvePublicApiUrl } from './apiUrl';

const devFlag = typeof __DEV__ === 'undefined' ? undefined : __DEV__;

export const API_URL = resolvePublicApiUrl({
  value: process.env.EXPO_PUBLIC_API_URL,
  nodeEnv: process.env.NODE_ENV,
  devFlag,
});

export const APP_SCHEME = 'musicmix';
export const OAUTH_REDIRECT = 'musicmix://auth/callback';

export const SESSION_TOKEN_KEY = 'musicmix.session';
export const RECOVERY_CODE_KEY = 'musicmix.recoveryCode';
