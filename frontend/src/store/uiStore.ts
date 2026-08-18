import { create } from 'zustand';
import type { SearchFilters, TrackResult } from '@/types';

interface UiState {
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  addTargetPlaylistId: string | null;
  setAddTargetPlaylistId: (id: string | null) => void;
  draftTracks: TrackResult[];
  setDraftTracks: (tracks: TrackResult[]) => void;
  removeDraftTrack: (providerTrackId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  filters: { duration: 'any' },
  setFilters: (filters) => set({ filters }),
  addTargetPlaylistId: null,
  setAddTargetPlaylistId: (id) => set({ addTargetPlaylistId: id }),
  draftTracks: [],
  setDraftTracks: (tracks) => set({ draftTracks: tracks }),
  removeDraftTrack: (providerTrackId) =>
    set((state) => ({
      draftTracks: state.draftTracks.filter((track) => track.providerTrackId !== providerTrackId),
    })),
}));
