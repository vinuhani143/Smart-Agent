import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { API_URL, SESSION_TOKEN_KEY } from '@/constants/config';
import { ApiClientError, messageForHttpStatus } from '@/utils/errors';
import type { ApiErrorBody } from '@/types';

const REQUEST_TIMEOUT_MS = 20_000;

interface AuthState {
  token: string | null;
  userId: string | null;
  hydrated: boolean;
  setSession: (token: string, userId: string) => Promise<void>;
  hydrate: () => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  hydrated: false,
  async setSession(token, userId) {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    set({ token, userId, hydrated: true });
  },
  async hydrate() {
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    set({ token, hydrated: true });
  },
  async clearSession() {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    set({ token: null, userId: null, hydrated: true });
  },
}));

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    const message = messageForHttpStatus(response.status, body.error?.message ?? '');
    return new ApiClientError(message, response.status, body.error?.code ?? 'UNKNOWN');
  } catch {
    return new ApiClientError(messageForHttpStatus(response.status, ''), response.status, 'UNKNOWN');
  }
}

function isMusicMixSessionError(error: ApiClientError): boolean {
  return (
    error.status === 401 &&
    (/MusicMix session/i.test(error.message) || /Sign in to MusicMix/i.test(error.message))
  );
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
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
      await useAuthStore.getState().clearSession();
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

export async function ensureSession(): Promise<void> {
  await useAuthStore.getState().hydrate();
  if (useAuthStore.getState().token) {
    return;
  }
  const created = await apiFetch<{ token: string; userId: string }>('/api/auth/session', {
    method: 'POST',
  }, true);
  await useAuthStore.getState().setSession(created.token, created.userId);
}
