/**
 * §9.2 (revised — Supabase Anonymous Authentication) — every mood and
 * session endpoint requires authentication. The bearer token is a
 * Supabase-issued access token (anonymous or otherwise); this middleware
 * verifies it server-side and attaches the verified `sub` as `req.userId`.
 * ⛔ A client-supplied user id is never trusted for authorization — the only
 * source of `req.userId` is a successfully verified JWT signature.
 *
 * The JWT secret is never logged (it never appears in any object passed to
 * `logger`). `JWT_SECRET` has no default anywhere in the schema (`env.ts`),
 * so missing Supabase configuration fails the boot, not silently falling
 * back to a shared/demo identity.
 */
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from './tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    const match = header?.match(/^Bearer (.+)$/);
    const rawToken = match?.[1];
    if (!rawToken) {
      res.status(401).json({ error: { code: 'unauthenticated', message: 'A valid bearer access token is required.' } });
      return;
    }
    const payload = verifyAccessToken(rawToken, jwtSecret);
    if (!payload) {
      res.status(401).json({ error: { code: 'unauthenticated', message: 'A valid bearer access token is required.' } });
      return;
    }
    req.userId = payload.sub;
    next();
  };
}
