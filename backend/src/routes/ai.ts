import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { aiGenerateLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import {
  confirmGeneratedPlaylist,
  createAiPlaylist,
  createAiPlaylistSchema,
  generateAiPlaylist,
  generateAiPlaylistSchema,
  generatePlaylist,
  getAiPlaylist,
  getAiStatus,
  legacyGeneratePlaylistSchema,
  replaceAiPlaylistTrack,
  replaceAiTrackSchema,
  updateAiPlaylist,
  updateAiPlaylistSchema,
} from '../controllers/aiController';

export const aiRouter = Router();

aiRouter.get('/status', requireAuth, getAiStatus);
aiRouter.post('/playlists/generate', requireAuth, aiGenerateLimiter, validateBody(generateAiPlaylistSchema), generateAiPlaylist);
aiRouter.get('/playlists/:id', requireAuth, getAiPlaylist);
aiRouter.put('/playlists/:id', requireAuth, validateBody(updateAiPlaylistSchema), updateAiPlaylist);
aiRouter.post('/playlists/:id/replace', requireAuth, validateBody(replaceAiTrackSchema), replaceAiPlaylistTrack);
aiRouter.post('/playlists/:id/create', requireAuth, validateBody(createAiPlaylistSchema), createAiPlaylist);

aiRouter.post('/generate-playlist', requireAuth, aiGenerateLimiter, validateBody(legacyGeneratePlaylistSchema), generatePlaylist);
aiRouter.post('/generate-playlist/:requestId/confirm', requireAuth, confirmGeneratedPlaylist);
