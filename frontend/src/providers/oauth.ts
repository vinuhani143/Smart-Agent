import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/services/api';
import { OAUTH_REDIRECT } from '@/constants/config';
import type { ProviderId } from '@/types';
import { ApiClientError } from '@/utils/errors';

WebBrowser.maybeCompleteAuthSession();

export async function connectProvider(kind: 'spotify' | 'google'): Promise<'success' | 'cancel'> {
  const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(`/api/auth/${kind}/start`, {
    method: 'POST',
  });
  const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, OAUTH_REDIRECT);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new ApiClientError(
      kind === 'google' ? 'YouTube connection was cancelled.' : 'Spotify connection was cancelled.',
      400,
      'OAUTH_CANCELLED',
    );
  }
  if (result.type === 'success') {
    const url = new URL(result.url);
    const status = url.searchParams.get('status');
    if (status === 'cancelled') {
      throw new ApiClientError(
        url.searchParams.get('message') ?? 'YouTube connection was cancelled.',
        400,
        'OAUTH_CANCELLED',
      );
    }
    if (status === 'error') {
      throw new ApiClientError(
        url.searchParams.get('message') ?? 'Could not connect the music service.',
        401,
        'OAUTH_FAILED',
      );
    }
    return 'success';
  }
  throw new ApiClientError('Could not complete sign-in.', 401, 'OAUTH_FAILED');
}

export async function disconnectProvider(provider: ProviderId): Promise<void> {
  const path = provider === 'youtube' ? '/api/auth/google/disconnect' : `/api/auth/${provider}/disconnect`;
  await apiFetch(path, { method: 'POST' });
}
