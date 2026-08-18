import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';
import type { SearchFilters, TrackResult } from '@/types';

function durationRange(duration: SearchFilters['duration']): {
  durationMinMs?: number;
  durationMaxMs?: number;
} {
  if (duration === 'short') {
    return { durationMaxMs: 3 * 60 * 1000 };
  }
  if (duration === 'medium') {
    return { durationMinMs: 3 * 60 * 1000, durationMaxMs: 5 * 60 * 1000 };
  }
  if (duration === 'long') {
    return { durationMinMs: 5 * 60 * 1000 };
  }
  return {};
}

export function useSearch(query: string, filters: SearchFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['search', query, filters],
    enabled: enabled && query.trim().length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ q: query.trim() });
      if (filters.language) params.set('language', filters.language);
      if (filters.genre) params.set('genre', filters.genre);
      if (filters.mood) params.set('mood', filters.mood);
      if (filters.yearFrom) params.set('yearFrom', filters.yearFrom);
      if (filters.yearTo) params.set('yearTo', filters.yearTo);
      const range = durationRange(filters.duration);
      if (range.durationMinMs) params.set('durationMinMs', String(range.durationMinMs));
      if (range.durationMaxMs) params.set('durationMaxMs', String(range.durationMaxMs));
      return apiFetch<{ tracks: TrackResult[] }>(`/api/search?${params.toString()}`);
    },
  });
}
