import { z } from 'zod';

export const providerIdSchema = z.enum(['spotify', 'youtube', 'amazon_music']);
export const searchProviderSchema = z.enum(['spotify', 'youtube', 'amazon_music', 'both']);

export const trackResultSchema = z.object({
  provider: providerIdSchema,
  providerTrackId: z.string().min(1).max(128),
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(300),
  album: z.string().max(300).optional(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  releaseDate: z.string().max(40).optional(),
  isrc: z.string().max(20).optional(),
  thumbnailUrl: z.string().max(2000).optional(),
  explicit: z.boolean().optional(),
  originalTitle: z.string().max(300).optional(),
  metadataConfidence: z.number().min(0).max(100).optional(),
  parsedTitle: z.string().max(300).optional(),
  parsedArtist: z.string().max(300).optional(),
  youtubeVideoId: z.string().max(64).optional(),
  spotifyId: z.string().max(64).optional(),
  amazonMusicId: z.string().max(128).optional(),
  url: z.string().max(2000).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  language: z.string().max(80).optional(),
  genre: z.string().max(80).optional(),
  mood: z.string().max(80).optional(),
  yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
  durationMinMs: z.coerce.number().int().min(0).optional(),
  durationMaxMs: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});
