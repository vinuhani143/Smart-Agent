import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';
import type { PlaylistSummary, TrackResult } from '@/types';

export function usePlaylists() {
  return useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiFetch<{ playlists: PlaylistSummary[] }>('/api/playlists'),
  });
}

export function usePlaylist(id: string | undefined) {
  return useQuery({
    queryKey: ['playlists', id],
    enabled: Boolean(id),
    queryFn: () => apiFetch<{ playlist: PlaylistSummary }>(`/api/playlists/${id}`),
  });
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ playlist: PlaylistSummary }>('/api/playlists', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useAddTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { playlistId: string; track: TrackResult }) =>
      apiFetch(`/api/playlists/${input.playlistId}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ track: input.track }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['playlists', variables.playlistId] });
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playlistId: string) =>
      apiFetch(`/api/playlists/${playlistId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}
