/**
 * ★ C7 (revised twice) — Supabase authentication, VERIFICATION ONLY.
 *
 * The backend is NOT a JWT issuer. Supabase issues, refreshes and revokes the
 * token; this backend's only job is to verify that a presented token really was
 * signed by the configured Supabase project, and to read the verified `sub`
 * claim as the authenticated principal. There is no second auth system, no
 * password, no server-side refresh-token table — Supabase owns all of that.
 *
 * ⛔ ES256 VIA JWKS, NOT HS256 WITH A SHARED SECRET.
 *
 * The first implementation verified HS256 against `JWT_SECRET`, which was
 * Supabase's legacy scheme. Current Supabase projects sign ASYMMETRICALLY and
 * publish only public keys — the project used here advertises
 * `{"alg":"ES256","kty":"EC","crv":"P-256"}` at its JWKS endpoint and has no
 * shared secret to hand out. Under the old code every real token was rejected
 * with 401, which presents as an application bug rather than an algorithm
 * mismatch.
 *
 * The asymmetric scheme is also strictly the safer one: this backend now holds
 * NO SIGNING MATERIAL AT ALL, only public keys. It can verify a token and is
 * structurally incapable of minting one, so a compromise here cannot forge an
 * identity.
 *
 * ⛔ `algorithms` is pinned to ES256. Never widen it and never omit it —
 * accepting whatever the token's own header asks for is the classic algorithm
 * confusion attack.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Whatever `jwtVerify` accepts as its key argument: a remote JWKS resolver in
 * production, or a bare public key in tests (which must never reach a network).
 */
export type TokenVerificationKey = Parameters<typeof jwtVerify>[1];

export interface AccessTokenPayload {
  sub: string; // Supabase auth.users.id — the authenticated principal.
}

/**
 * Builds the remote JWKS resolver for a Supabase project.
 *
 * `createRemoteJWKSet` caches keys and refetches only when it meets an
 * unknown `kid`, so this is one network call per key rotation, not per request.
 *
 * ⛔ Call this ONCE at startup and share the result. Constructing a new
 * resolver per request would defeat the cache and put a network round trip in
 * front of every authenticated call.
 */
export function createSupabaseJwks(supabaseUrl: string): TokenVerificationKey {
  const base = supabaseUrl.replace(/\/+$/, '');
  return createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
}

/**
 * Verifies a Supabase-issued access token.
 *
 * Returns the payload on success and `undefined` on ANY failure — bad
 * signature, expired, malformed, unknown key, wrong algorithm, missing `sub`,
 * or the JWKS endpoint being unreachable. It never throws and never reports
 * WHY, so a caller cannot accidentally leak a token, a stack trace or a
 * distinguishing error into a response or a log line.
 */
export async function verifyAccessToken(
  token: string,
  key: TokenVerificationKey,
): Promise<AccessTokenPayload | undefined> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'] });
    if (typeof payload.sub === 'string' && payload.sub.length > 0) {
      return { sub: payload.sub };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
