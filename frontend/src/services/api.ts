import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { API_URL, SESSION_TOKEN_KEY } from '@/constants/config';
import { ApiClientError } from '@/utils/errors';
import type { ApiErrorBody } from '@/types';

interface AuthState {
  token: string | null;
  userId: string | null;
  hydrated: boolean;
  setSession: (token: string, userId: string) => Promise<void>;
  hydrate: () => Promise<void>;
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
}));

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiClientError(
      body.error?.message ?? 'Request failed.',
      response.status,
      body.error?.code ?? 'UNKNOWN',
    );
  } catch {
    return new ApiClientError('Request failed.', response.status, 'UNKNOWN');
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiClientError(
      'Cannot reach the MusicMix server. Check EXPO_PUBLIC_API_URL and that the backend is running.',
      0,
      'NETWORK_ERROR',
    );
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
  });
  await useAuthStore.getState().setSession(created.token, created.userId);
}
