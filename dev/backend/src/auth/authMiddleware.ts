/**
 * §9.2 (revised — Supabase authentication) — every mood and session endpoint
 * requires authentication. The bearer token is a Supabase-issued access token
 * (anonymous or otherwise); this middleware verifies it server-side against the
 * project's published ES256 public keys and attaches the verified `sub` as
 * `req.userId`.
 *
 * ⛔ A client-supplied user id is NEVER trusted for authorization — the only
 * source of `req.userId` is a successfully verified signature.
 *
 * ⛔ The key resolver is INJECTED, not constructed here. It is built once at
 * startup (`createSupabaseJwks`) and shared, so JWKS fetches are cached rather
 * than repeated per request; and tests supply a local public key so no test run
 * can reach a network.
 *
 * Verification is asynchronous (a JWKS lookup may need a fetch on first use or
 * after a key rotation), so this middleware resolves a promise rather than
 * returning synchronously. Every failure path answers 401 with the SAME body —
 * expired, forged, malformed and unknown-key are deliberately indistinguishable
 * to the caller.
 */
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type TokenVerificationKey } from './tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

const UNAUTHENTICATED = {
  error: { code: 'unauthenticated', message: 'A valid bearer access token is required.' },
} as const;

export function requireAuth(key: TokenVerificationKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    const match = header?.match(/^Bearer (.+)$/);
    const rawToken = match?.[1];
    if (!rawToken) {
      res.status(401).json(UNAUTHENTICATED);
      return;
    }

    void verifyAccessToken(rawToken, key)
      .then((payload) => {
        if (!payload) {
          res.status(401).json(UNAUTHENTICATED);
          return;
        }
        req.userId = payload.sub;
        next();
      })
      .catch(() => {
        // verifyAccessToken already swallows its own failures; this is a
        // belt-and-braces guard so an unexpected rejection can never surface
        // as an unhandled promise or a 500 that leaks a stack trace.
        res.status(401).json(UNAUTHENTICATED);
      });
  };
}
