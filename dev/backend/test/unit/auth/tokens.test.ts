/**
 * ★ C7 (revised) — Supabase JWT verification only. This backend is not an
 * issuer; these tests exercise verification against tokens signed the way
 * Supabase signs them (HS256, `sub` = auth.users.id).
 */
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { verifyAccessToken } from '../../../src/auth/tokens.js';

const SECRET = 'a-test-secret';

describe('verifyAccessToken — Supabase token verification', () => {
  it('accepts a validly signed token and returns its sub', () => {
    const token = jwt.sign({ sub: 'user-123', aud: 'authenticated' }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    const result = verifyAccessToken(token, SECRET);
    expect(result).toEqual({ sub: 'user-123' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'user-123' }, 'wrong-secret', { algorithm: 'HS256', expiresIn: '1h' });
    expect(verifyAccessToken(token, SECRET)).toBeUndefined();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'user-123' }, SECRET, { algorithm: 'HS256', expiresIn: -10 });
    expect(verifyAccessToken(token, SECRET)).toBeUndefined();
  });

  it('rejects a token with no sub claim', () => {
    const token = jwt.sign({ aud: 'authenticated' }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    expect(verifyAccessToken(token, SECRET)).toBeUndefined();
  });

  it('rejects garbage input without throwing', () => {
    expect(verifyAccessToken('not-a-jwt', SECRET)).toBeUndefined();
  });

  // ⛔ Never trust a client-supplied user id — only a verified signature may
  // produce a principal. Confirmed structurally: verifyAccessToken has no
  // parameter through which a caller could pass an unverified id and have
  // it echoed back; the ONLY way `sub` reaches the return value is via
  // `jwt.verify` succeeding.
  it('a token with an unrecognized algorithm (alg confusion) is rejected', () => {
    const token = jwt.sign({ sub: 'user-123' }, SECRET, { algorithm: 'HS384', expiresIn: '1h' } as never);
    expect(verifyAccessToken(token, SECRET)).toBeUndefined();
  });
});
