import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';
import type { PlaylistSummary, TrackResult } from '@/types';
import { createIdempotencyGuard } from '@/utils/idempotency';

export { newIdempotencyKey } from '@/utils/idempotency';

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
  const guard = useRef(createIdempotencyGuard());
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ playlist: PlaylistSummary }>('/api/playlists', {
        method: 'POST',
        headers: { 'Idempotency-Key': guard.current.keyFor(body) },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      guard.current.reset();
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

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { playlistId: string; name?: string; description?: string }) =>
      apiFetch<{ playlist: PlaylistSummary }>(`/api/playlists/${input.playlistId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: input.name, description: input.description }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['playlists', variables.playlistId] });
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useRemoveTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { playlistId: string; trackId: string }) =>
      apiFetch(`/api/playlists/${input.playlistId}/tracks/${input.trackId}`, { method: 'DELETE' }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['playlists', variables.playlistId] });
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useReorderTracks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { playlistId: string; trackIds: string[] }) =>
      apiFetch<{ playlist: PlaylistSummary }>(`/api/playlists/${input.playlistId}/tracks/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ trackIds: input.trackIds }),
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
