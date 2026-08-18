import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { confirmGeneratedPlaylist, generatePlaylist } from '../controllers/aiController';
import { generatePlaylistSchema } from '../services/PlaylistGenerationService';

export const aiRouter = Router();

aiRouter.post('/generate-playlist', requireAuth, validateBody(generatePlaylistSchema), generatePlaylist);
aiRouter.post('/generate-playlist/:requestId/confirm', requireAuth, confirmGeneratedPlaylist);
