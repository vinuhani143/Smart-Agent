import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestId: RequestHandler = (req, res, next) => {
  const header = req.header('x-request-id');
  const id = header && header.length <= 64 ? header : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
