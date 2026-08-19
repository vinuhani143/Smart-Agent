import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { API_NOT_CONFIGURED_MESSAGE, isPlaceholderApiUrl } from '@/constants/apiUrl';
import { API_URL, RECOVERY_CODE_KEY, SESSION_TOKEN_KEY } from '@/constants/config';
import { ApiClientError, messageForHttpStatus } from '@/utils/errors';
import type { ApiErrorBody } from '@/types';

const REQUEST_TIMEOUT_MS = 20_000;

interface AuthState {
  token: string | null;
  userId: string | null;
  anonymous: boolean;
  recoveryCode: string | null;
  accountWarning: string | null;
  hydrated: boolean;
  setSession: (
    token: string,
    userId: string,
    extras?: { recoveryCode?: string; warning?: string; anonymous?: boolean },
  ) => Promise<void>;
  hydrate: () => Promise<void>;
  expireSession: () => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  anonymous: true,
  recoveryCode: null,
  accountWarning: null,
  hydrated: false,
  async setSession(token, userId, extras) {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    if (extras?.recoveryCode) {
      await SecureStore.setItemAsync(RECOVERY_CODE_KEY, extras.recoveryCode);
    }
    const storedCode = extras?.recoveryCode ?? (await SecureStore.getItemAsync(RECOVERY_CODE_KEY));
    set({
      token,
      userId,
      hydrated: true,
      anonymous: extras?.anonymous ?? true,
      recoveryCode: storedCode,
      accountWarning: extras?.warning ?? null,
    });
  },
  async hydrate() {
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    const recoveryCode = await SecureStore.getItemAsync(RECOVERY_CODE_KEY);
    set({ token, recoveryCode, hydrated: true });
  },
  async expireSession() {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    set({ token: null, userId: null, hydrated: true });
  },
  async clearSession() {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    await SecureStore.deleteItemAsync(RECOVERY_CODE_KEY);
    set({ token: null, userId: null, recoveryCode: null, accountWarning: null, hydrated: true, anonymous: true });
  },
}));

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    const message = messageForHttpStatus(response.status, body.error?.message ?? '');
    return new ApiClientError(message, response.status, body.error?.code ?? 'UNKNOWN');
  } catch {
    const message =
      response.status === 404
        ? 'Cannot reach the MusicMix server. This install is not pointed at a live API.'
        : messageForHttpStatus(response.status, '');
    return new ApiClientError(message, response.status, 'API_UNREACHABLE');
  }
}

function isMusicMixSessionError(error: ApiClientError): boolean {
  return (
    error.status === 401 &&
    (/MusicMix session/i.test(error.message) || /Sign in to MusicMix/i.test(error.message))
  );
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  if (isPlaceholderApiUrl(API_URL)) {
    throw new ApiClientError(API_NOT_CONFIGURED_MESSAGE, 0, 'API_NOT_CONFIGURED');
  }
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (init.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('The request timed out. Check your connection and try again.', 0, 'TIMEOUT');
    }
    throw new ApiClientError(
      'Cannot reach the MusicMix server. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 && !isRetry && path !== '/api/auth/session') {
    const unauthorized = await parseError(response);
    if (isMusicMixSessionError(unauthorized)) {
      await useAuthStore.getState().expireSession();
      await ensureSession();
      return apiFetch<T>(path, init, true);
    }
    throw unauthorized;
  }

  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function restoreWithRecoveryCode(
  recoveryCode: string,
  options: { deleteThrowaway?: boolean } = {},
): Promise<void> {
  const throwawayToken = useAuthStore.getState().token;
  const response = await fetch(`${API_URL}/api/auth/recover`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryCode: recoveryCode.trim() }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const recovered = (await response.json()) as { token: string; userId: string; anonymous?: boolean };
  if (options.deleteThrowaway && throwawayToken && throwawayToken !== recovered.token) {
    await fetch(`${API_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', Authorization: `Bearer ${throwawayToken}` },
    }).catch(() => undefined);
  }
  await useAuthStore.getState().setSession(recovered.token, recovered.userId, {
    anonymous: recovered.anonymous ?? true,
    recoveryCode: recoveryCode.trim().toUpperCase(),
  });
}

export async function ensureSession(): Promise<void> {
  await useAuthStore.getState().hydrate();
  if (useAuthStore.getState().token) {
    return;
  }
  const recoveryCode = useAuthStore.getState().recoveryCode;
  if (recoveryCode) {
    try {
      await restoreWithRecoveryCode(recoveryCode);
      return;
    } catch {
      // Invalid or deleted recovery code: create a new device-only account.
    }
  }
  const created = await apiFetch<{
    token: string;
    userId: string;
    anonymous?: boolean;
    recoveryCode?: string;
    warning?: string;
  }>(
    '/api/auth/session',
    {
      method: 'POST',
    },
    true,
  );
  await useAuthStore.getState().setSession(created.token, created.userId, {
    anonymous: created.anonymous,
    recoveryCode: created.recoveryCode,
    warning: created.warning,
  });
}
