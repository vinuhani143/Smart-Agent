import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';
import type {
  ConversionResult,
  ConvertibleProvider,
  RemotePlaylist,
  TrackResult,
} from '@/types';

export interface ConversionDecision {
  sourceTrackId: string;
  action: 'accept' | 'skip' | 'select_alternative' | 'manual';
  destinationTrack?: TrackResult;
}

export function useRemotePlaylists(provider: ConvertibleProvider | undefined) {
  return useQuery({
    queryKey: ['remote-playlists', provider],
    enabled: Boolean(provider),
    queryFn: () => apiFetch<{ playlists: RemotePlaylist[] }>(`/api/providers/${provider}/playlists`),
  });
}

export function useAnalyzeConversion() {
  return useMutation({
    mutationFn: (body: {
      sourceProvider: ConvertibleProvider;
      sourcePlaylistId: string;
      destinationProvider: ConvertibleProvider;
      allowSameProvider?: boolean;
    }) =>
      apiFetch<ConversionResult>('/api/conversions/analyze', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useConfirmConversion() {
  return useMutation({
    mutationFn: (input: {
      conversionId: string;
      acceptAllHighConfidence?: boolean;
      decisions?: ConversionDecision[];
    }) =>
      apiFetch<ConversionResult>(`/api/conversions/${input.conversionId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          acceptAllHighConfidence: input.acceptAllHighConfidence,
          decisions: input.decisions,
        }),
      }),
  });
}

export function useCreateConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversionId: string; name?: string; description?: string }) =>
      apiFetch<ConversionResult>(`/api/conversions/${input.conversionId}/create`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          description: input.description,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useDestinationSearch(provider: ConvertibleProvider | undefined, query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['conversion-search', provider, query],
    enabled: Boolean(provider) && enabled && query.trim().length > 0,
    queryFn: () =>
      apiFetch<{ tracks: TrackResult[] }>(
        `/api/search/${provider}?q=${encodeURIComponent(query.trim())}`,
      ),
  });
}
