import { useEffect } from 'react';
import { ensureSession, useAuthStore } from '@/services/api';

export function useSession() {
  const hydrated = useAuthStore((state) => state.hydrated);

  useEffect(() => {
    void ensureSession();
  }, []);

  return { ready: hydrated };
}
