import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';

/** Propagated to all three upstream services as a correlation id (§9.5). */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER);
  const id = incoming && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader(HEADER, id);
  next();
}
