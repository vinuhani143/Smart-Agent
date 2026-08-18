import { Router } from 'express';
import { cleanupRemotePlaylistOperation } from '../controllers/authController';

export const internalRouter = Router();

internalRouter.post('/remote-operations/:id/cleanup', (req, res, next) => {
  void cleanupRemotePlaylistOperation(req, res).catch(next);
});
