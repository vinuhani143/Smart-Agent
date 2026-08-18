import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { toPrismaProvider } from '../providers/ProviderRegistry';
import {
  generatePlaylistPreview,
  generatePlaylistSchema,
} from '../services/PlaylistGenerationService';
import { createLocalPlaylist } from '../services/PlaylistService';

export async function generatePlaylist(req: Request, res: Response): Promise<void> {
  const input = generatePlaylistSchema.parse(req.body);
  const preview = await generatePlaylistPreview(req.userId!, input);

  const request = await prisma.playlistGenerationRequest.create({
    data: {
      userId: req.userId!,
      prompt: preview.filters.prompt,
      language: preview.filters.language,
      mood: preview.filters.mood,
      genre: preview.filters.genre,
      yearFrom: preview.filters.yearFrom,
      yearTo: preview.filters.yearTo,
      durationMinutes: preview.filters.durationMinutes,
      allowDuplicates: preview.filters.allowDuplicates,
      targetProvider: preview.filters.targetProvider
        ? toPrismaProvider(preview.filters.targetProvider)
        : undefined,
      status: 'GENERATED',
      candidateTracks: JSON.parse(JSON.stringify(preview.tracks)) as object,
    },
  });

  res.json({
    requestId: request.id,
    interpretation: preview.interpretation,
    totalDurationMs: preview.totalDurationMs,
    tracks: preview.tracks,
    confirmationRequired: true,
  });
}

export async function confirmGeneratedPlaylist(req: Request, res: Response): Promise<void> {
  const requestId = String(req.params.requestId);
  const name = typeof req.body?.name === 'string' ? req.body.name : 'Generated playlist';
  const request = await prisma.playlistGenerationRequest.findFirst({
    where: { id: requestId, userId: req.userId! },
  });
  if (!request) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'That generated playlist was not found.' },
    });
    return;
  }

  const tracks = Array.isArray(request.candidateTracks) ? request.candidateTracks : [];
  const playlist = await createLocalPlaylist(req.userId!, {
    name,
    description: request.prompt ?? undefined,
    language: request.language ?? undefined,
    genre: request.genre ?? undefined,
    mood: request.mood ?? undefined,
    yearFrom: request.yearFrom ?? undefined,
    yearTo: request.yearTo ?? undefined,
    tracks: tracks as never,
    allowDuplicates: request.allowDuplicates,
  });

  await prisma.playlistGenerationRequest.update({
    where: { id: request.id },
    data: { status: 'CONFIRMED', resultPlaylistId: playlist.id },
  });

  res.json({ playlistId: playlist.id, confirmationRequired: false });
}
