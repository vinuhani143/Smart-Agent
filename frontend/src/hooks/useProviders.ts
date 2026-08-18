import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';
import { connectProvider, disconnectProvider } from '@/providers/oauth';
import type { ProviderStatus } from '@/types';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => apiFetch<{ providers: ProviderStatus[] }>('/api/providers'),
  });
}

export function useConnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: 'spotify' | 'google') => connectProvider(kind),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useDisconnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectProvider,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}
