import { Router } from 'express';
import { health, releaseReadiness } from '../controllers/healthController';
import { authRouter } from './auth';
import { providersRouter } from './providers';
import { searchRouter } from './search';
import { playlistsRouter } from './playlists';
import { conversionsRouter } from './conversions';
import { aiRouter } from './ai';
import { internalRouter } from './internal';

export const apiRouter = Router();

apiRouter.get('/health', (req, res, next) => {
  void health(req, res).catch(next);
});
apiRouter.get('/release-readiness', (req, res, next) => {
  void releaseReadiness(req, res).catch(next);
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/providers', providersRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/playlists', playlistsRouter);
apiRouter.use('/conversions', conversionsRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/internal', internalRouter);
