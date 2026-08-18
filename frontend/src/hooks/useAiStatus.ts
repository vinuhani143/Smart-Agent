import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';

export interface AiStatus {
  configured: boolean;
  provider: string | null;
  modelConfigured: boolean;
  apiKeyConfigured: boolean;
}

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => apiFetch<AiStatus>('/api/ai/status'),
  });
}
