/**
 * ★ C7 (revised twice) — Supabase JWT verification only.
 *
 * This backend is not an issuer; these tests exercise verification against
 * tokens signed the way current Supabase projects sign them: **ES256**, with
 * `sub` = auth.users.id.
 *
 * ⛔ NO NETWORK. Production resolves keys from the project's JWKS endpoint, but
 * every test here passes a locally generated PUBLIC KEY directly. A test run
 * cannot reach Supabase, so these assertions are about verification logic and
 * nothing else.
 */
import type { webcrypto } from 'node:crypto';
import { SignJWT, generateKeyPair, exportJWK, importJWK, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyAccessToken } from '../../../src/auth/tokens.js';

type CryptoKey = webcrypto.CryptoKey;

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  publicKey = pair.publicKey as CryptoKey;
  publicJwk = await exportJWK(publicKey);

  // A second, unrelated project key — for the forged-token case.
  const other = await generateKeyPair('ES256', { extractable: true });
  otherPrivateKey = other.privateKey as CryptoKey;
});

function sign(claims: Record<string, unknown>, expiry: string | number, key: CryptoKey = privateKey) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(key);
}

describe('verifyAccessToken — Supabase ES256 token verification', () => {
  it('accepts a validly signed token and returns its sub', async () => {
    const token = await sign({ sub: 'user-123', aud: 'authenticated' }, '1h');
    await expect(verifyAccessToken(token, publicKey)).resolves.toEqual({ sub: 'user-123' });
  });

  it('rejects a token signed by a DIFFERENT key (a forged or foreign project token)', async () => {
    const token = await sign({ sub: 'user-123' }, '1h', otherPrivateKey);
    await expect(verifyAccessToken(token, publicKey)).resolves.toBeUndefined();
  });

  it('rejects an expired token', async () => {
    const token = await sign({ sub: 'user-123' }, Math.floor(Date.now() / 1000) - 10);
    await expect(verifyAccessToken(token, publicKey)).resolves.toBeUndefined();
  });

  it('rejects a token with no sub claim', async () => {
    const token = await sign({ aud: 'authenticated' }, '1h');
    await expect(verifyAccessToken(token, publicKey)).resolves.toBeUndefined();
  });

  it('rejects an empty sub', async () => {
    const token = await sign({ sub: '' }, '1h');
    await expect(verifyAccessToken(token, publicKey)).resolves.toBeUndefined();
  });

  it('rejects garbage input without throwing', async () => {
    await expect(verifyAccessToken('not-a-jwt', publicKey)).resolves.toBeUndefined();
    await expect(verifyAccessToken('', publicKey)).resolves.toBeUndefined();
  });

  /**
   * ⛔ ALGORITHM CONFUSION. The classic attack is to present a token whose own
   * header names a weaker algorithm and hope the verifier obliges. `algorithms`
   * is pinned to ES256 precisely so the token cannot choose.
   */
  it('rejects an HS256 token even when its payload is otherwise valid (alg confusion)', async () => {
    const hs = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-shared-secret-an-attacker-might-guess'));
    await expect(verifyAccessToken(hs, publicKey)).resolves.toBeUndefined();
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user-123' })).toString('base64url');
    await expect(verifyAccessToken(`${header}.${payload}.`, publicKey)).resolves.toBeUndefined();
  });

  /**
   * ⛔ A client-supplied user id is never trusted. `verifyAccessToken` has no
   * parameter through which a caller could pass an unverified id and have it
   * echoed back — the ONLY route to the return value is a signature that
   * verifies against the supplied key.
   */
  it('a tampered payload invalidates the signature', async () => {
    const token = await sign({ sub: 'user-123' }, '1h');
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    await expect(verifyAccessToken(`${h}.${forged}.${s}`, publicKey)).resolves.toBeUndefined();
  });

  it('verifies against a key imported from a JWKS-shaped JWK, as production does', async () => {
    const imported = await importJWK({ ...publicJwk, alg: 'ES256' }, 'ES256');
    const token = await sign({ sub: 'user-456' }, '1h');
    await expect(verifyAccessToken(token, imported as CryptoKey)).resolves.toEqual({ sub: 'user-456' });
  });
});
