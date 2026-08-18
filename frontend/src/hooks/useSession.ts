import { useEffect } from 'react';
import { ensureSession, useAuthStore } from '@/services/api';
import { usePreferencesStore } from '@/store/preferencesStore';

export function useSession() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const prefsHydrated = usePreferencesStore((state) => state.hydrated);

  useEffect(() => {
    void ensureSession();
    void usePreferencesStore.getState().hydrate();
  }, []);

  return { ready: hydrated && prefsHydrated };
}
