import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '../types/errors';
import { errorHandler } from './errorHandler';

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('errorHandler', () => {
  it('returns a request id and never includes stack traces or token details', () => {
    const req = { requestId: 'req-audit-1' } as Request;
    const res = mockRes();
    const err = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid playlist name.', 400, {
      refreshToken: 'should-not-leak',
      accessToken: 'should-not-leak',
      field: 'name',
    });
    errorHandler(err, req, res, (() => undefined) as NextFunction);
    const body = res.body as { error: Record<string, unknown> };
    assert.equal(res.statusCode, 400);
    assert.equal(body.error.requestId, 'req-audit-1');
    assert.equal(body.error.message, 'Invalid playlist name.');
    assert.equal(body.error.stack, undefined);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('should-not-leak'), false);
    assert.equal(serialized.includes('node_modules'), false);
    assert.deepEqual(body.error.details, { field: 'name' });
  });

  it('hides unexpected errors behind a generic production message', () => {
    const req = { requestId: 'req-audit-2' } as Request;
    const res = mockRes();
    const err = new Error('relation "Playlist" does not exist\n    at Parser.parse (/app/node_modules/pg/index.js:1:1)');
    errorHandler(err, req, res, (() => undefined) as NextFunction);
    const body = res.body as { error: Record<string, unknown> };
    assert.equal(res.statusCode, 500);
    assert.equal(body.error.message, 'Something went wrong. Please try again.');
    assert.equal(body.error.requestId, 'req-audit-2');
    assert.equal(JSON.stringify(body).includes('node_modules'), false);
    assert.equal(JSON.stringify(body).includes('Playlist'), false);
  });
});
