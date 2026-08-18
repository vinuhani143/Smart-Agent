import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';
import type { SearchFilters, TrackResult } from '@/types';

const PAGE_SIZE = 20;

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

function searchPath(query: string, filters: SearchFilters, offset: number): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (filters.language) params.set('language', filters.language);
  if (filters.genre) params.set('genre', filters.genre);
  if (filters.mood) params.set('mood', filters.mood);
  if (filters.yearFrom) params.set('yearFrom', filters.yearFrom);
  if (filters.yearTo) params.set('yearTo', filters.yearTo);
  const range = durationRange(filters.duration);
  if (range.durationMinMs) params.set('durationMinMs', String(range.durationMinMs));
  if (range.durationMaxMs) params.set('durationMaxMs', String(range.durationMaxMs));
  params.set('limit', String(PAGE_SIZE));
  if (offset > 0) {
    params.set('offset', String(offset));
  }
  return filters.provider && filters.provider !== 'all'
    ? `/api/search/${filters.provider}?${params.toString()}`
    : `/api/search?${params.toString()}`;
}

export function useSearch(query: string, filters: SearchFilters, enabled: boolean, offset = 0) {
  return useQuery({
    queryKey: ['search', query, filters, offset],
    enabled: enabled && query.trim().length > 0,
    queryFn: () => apiFetch<{ tracks: TrackResult[] }>(searchPath(query, filters, offset)),
  });
}

export function useInfiniteSearch(query: string, filters: SearchFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['search-infinite', query, filters],
    enabled: enabled && query.trim().length >= 2,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = typeof pageParam === 'number' ? pageParam : 0;
      const result = await apiFetch<{ tracks: TrackResult[] }>(searchPath(query, filters, offset));
      return { tracks: result.tracks, offset };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.tracks.length < PAGE_SIZE) {
        return undefined;
      }
      return lastPage.offset + PAGE_SIZE;
    },
  });
}
