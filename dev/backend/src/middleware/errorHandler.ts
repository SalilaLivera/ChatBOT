import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

/** Express 4-arg error middleware — must keep this exact signature to be recognized. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = res.getHeader('x-request-id');

  if (err instanceof AppError) {
    logger.error({ requestId, code: err.code, detail: err.detail }, err.message);
    res.status(err.httpStatus).json(err.toEnvelope());
    return;
  }

  const message = err instanceof Error ? err.message : 'unknown error';
  logger.error({ requestId, err: message }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'an unexpected error occurred',
    },
  });
}
