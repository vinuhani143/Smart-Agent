import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  deleteRemotePlaylist,
  getProviders,
  getRemotePlaylist,
  listRemotePlaylists,
  updateRemotePlaylist,
  updateRemotePlaylistSchema,
} from '../controllers/providerController';

export const providersRouter = Router();

providersRouter.get('/', requireAuth, getProviders);
providersRouter.get('/:provider/playlists', requireAuth, listRemotePlaylists);
providersRouter.get('/:provider/playlists/:playlistId', requireAuth, getRemotePlaylist);
providersRouter.put(
  '/:provider/playlists/:playlistId',
  requireAuth,
  validateBody(updateRemotePlaylistSchema),
  updateRemotePlaylist,
);
providersRouter.delete('/:provider/playlists/:playlistId', requireAuth, deleteRemotePlaylist);
