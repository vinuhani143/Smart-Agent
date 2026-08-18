import { Router } from 'express';
import { authRouter } from './auth';
import { providersRouter } from './providers';
import { searchRouter } from './search';
import { playlistsRouter } from './playlists';
import { aiRouter } from './ai';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'musicmix-backend' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/providers', providersRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/playlists', playlistsRouter);
apiRouter.use('/ai', aiRouter);
