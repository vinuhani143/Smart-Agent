export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

if (typeof __DEV__ !== 'undefined' && !__DEV__ && /localhost|127\.0\.0\.1/.test(API_URL)) {
  console.warn('EXPO_PUBLIC_API_URL points at localhost in a non-dev build. Set the production API origin before release.');
}

export const APP_SCHEME = 'musicmix';
export const OAUTH_REDIRECT = 'musicmix://auth/callback';

export const SESSION_TOKEN_KEY = 'musicmix.session';
