import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  addTrack,
  addTrackSchema,
  convertPreview,
  convertSchema,
  create,
  createOnProvider,
  createOnProviderSchema,
  createPlaylistSchema,
  getOne,
  list,
  remove,
  removeTrack,
  reorderTracks,
  reorderTracksSchema,
  update,
  updatePlaylistSchema,
} from '../controllers/playlistController';

export const playlistsRouter = Router();

playlistsRouter.get('/', requireAuth, list);
playlistsRouter.post('/', requireAuth, validateBody(createPlaylistSchema), create);
playlistsRouter.post('/convert', requireAuth, validateBody(convertSchema), convertPreview);
playlistsRouter.get('/:id', requireAuth, getOne);
playlistsRouter.put('/:id', requireAuth, validateBody(updatePlaylistSchema), update);
playlistsRouter.delete('/:id', requireAuth, remove);
playlistsRouter.post('/:id/tracks', requireAuth, validateBody(addTrackSchema), addTrack);
playlistsRouter.patch('/:id/tracks/reorder', requireAuth, validateBody(reorderTracksSchema), reorderTracks);
playlistsRouter.delete('/:id/tracks/:trackId', requireAuth, removeTrack);
playlistsRouter.post(
  '/:id/create-on-provider',
  requireAuth,
  validateBody(createOnProviderSchema),
  createOnProvider,
);
