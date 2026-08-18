import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';
import { connectProvider, disconnectProvider } from '@/providers/oauth';
import type { ProviderStatus } from '@/types';

export interface ProviderFeatureStatus {
  spotify: { enabled: boolean; configured: boolean };
  youtube: { enabled: boolean; configured: boolean };
  amazonMusic: {
    enabled: boolean;
    configured: boolean;
    accessStatus:
      | 'disabled'
      | 'not_configured'
      | 'configured'
      | 'authenticated'
      | 'api_access_denied'
      | 'closed_beta';
    learnMoreUrl?: string;
  };
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => apiFetch<{ providers: ProviderStatus[] }>('/api/providers'),
  });
}

export function useProviderFeatureStatus() {
  return useQuery({
    queryKey: ['providers-status'],
    queryFn: () => apiFetch<ProviderFeatureStatus>('/api/providers/status'),
  });
}

export function useConnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: 'spotify' | 'google' | 'amazon') => connectProvider(kind),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
      void queryClient.invalidateQueries({ queryKey: ['providers-status'] });
    },
  });
}

export function useDisconnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectProvider,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
      void queryClient.invalidateQueries({ queryKey: ['providers-status'] });
    },
  });
}
