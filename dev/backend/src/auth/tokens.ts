/**
 * ★ C7 (revised) — Supabase Anonymous Authentication, verification only.
 *
 * The backend is NOT a JWT issuer. Supabase issues, refreshes and revokes
 * the token; this backend's only job is to verify the signature and expiry
 * of a token Supabase already issued, and to read the verified `sub` claim
 * as the authenticated principal. There is no second auth system, no
 * password, no server-side refresh-token table — Supabase owns all of that.
 *
 * `JWT_SECRET` (env) is the Supabase project's JWT secret (Project Settings
 * → API → JWT Secret) — the same HS256 shared secret Supabase itself signs
 * with. It is never defaulted and never logged (unchanged from pre-pivot
 * §9.2, and still exercised by the existing O-16-style boot-fail-fast test).
 */
import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string; // Supabase auth.users.id — the authenticated principal.
}

/**
 * Verifies a Supabase-issued access token. Returns the payload on success,
 * `undefined` on any failure (bad signature, expired, malformed, no `sub`) —
 * never throws, so a caller cannot forget to catch and accidentally leak a
 * stack trace or the token itself into a response or a log line.
 */
export function verifyAccessToken(token: string, secret: string): AccessTokenPayload | undefined {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'object' && decoded !== null && typeof decoded.sub === 'string' && decoded.sub.length > 0) {
      return { sub: decoded.sub };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
