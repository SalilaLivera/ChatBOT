/**
 * ★ C7 (revised twice) — auth, session ownership (TRAP 2), and durable
 * persistence, driven over HTTP against the REAL app assembly (`buildApp()`),
 * a REAL Postgres (migrated — see migrations/), and the REAL
 * fer/sentiment/fusion containers (matching the pre-existing O-21 pattern:
 * several C5/C6 integration tests already require the live stack; this file
 * does too, for the same reason — `npm test` is documented as non-hermetic,
 * see O-21 in C7_DONE.md).
 *
 * ⛔ ES256, NOT HS256. Current Supabase projects sign asymmetrically and
 * publish only PUBLIC keys — there is no shared secret to fake a token with.
 * This test generates its own EC keypair, signs tokens with the PRIVATE half
 * locally (a correct stand-in for "a token Supabase issued"), and injects the
 * PUBLIC half into `buildApp()` via its `authKey` parameter. NO NETWORK CALL
 * happens — `auth/tokens.ts`'s real verification logic runs unmodified
 * against a key this test controls, exactly as it would against Supabase's
 * real JWKS in production.
 */
import type { webcrypto } from 'node:crypto';
import { SignJWT, generateKeyPair } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

type CryptoKey = webcrypto.CryptoKey;

let signingKey: CryptoKey;

function fakeSupabaseToken(sub: string): Promise<string> {
  return new SignJWT({ sub, aud: 'authenticated', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(signingKey);
}

let server: Server;
let base: string;
let pool: pg.Pool;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= 'postgres://maternalink:changeme@localhost:5432/maternalink';
  process.env.SUPABASE_URL ??= 'https://test-not-a-real-project.supabase.co';
  process.env.FER_SERVICE_URL ??= 'http://localhost:7860';
  process.env.SENTIMENT_SERVICE_URL ??= 'http://localhost:8001';
  process.env.FUSION_SERVICE_URL ??= 'http://localhost:9000';

  const pair = await generateKeyPair('ES256', { extractable: true });
  signingKey = pair.privateKey as CryptoKey;

  const { buildApp } = await import('../../src/server.js');
  const app = buildApp(pair.publicKey as CryptoKey);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const { Pool } = pg;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

describe('C7 Part A — unauthenticated requests are rejected', () => {
  it('POST /api/v1/mood/analyse with no bearer token → 401', async () => {
    const res = await fetch(`${base}/api/v1/mood/analyse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/session/camera/consent with no bearer token → 401', async () => {
    const res = await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-id': 'unauth-s1' },
      body: JSON.stringify({ granted: true }),
    });
    expect(res.status).toBe(401);
  });

  it('a garbage bearer token → 401 (never crashes, never trusts the payload)', async () => {
    const res = await fetch(`${base}/api/v1/mood/analyse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-real-jwt' },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('C7 TRAP 2 — a session owned by another user is externally indistinguishable from one that never existed', () => {
  // Real Supabase `sub` values are UUIDs — `users.id` / `camera_consent_
  // events.user_id` are UUID columns, so the test doubles must be too.
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const sessionId = `trap2-${crypto.randomUUID()}`;
  const neverExistedId = `trap2-never-${crypto.randomUUID()}`;
  // ⛔ signed in beforeAll, not at describe-body eval time: signing is
  // async (jose), and a describe body cannot await.
  let tokenA = '';
  let tokenB = '';
  beforeAll(async () => {
    tokenA = await fakeSupabaseToken(userA);
    tokenB = await fakeSupabaseToken(userB);
  });

  it('user A can grant consent for their own session', async () => {
    const res = await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}`, 'x-session-id': sessionId },
      body: JSON.stringify({ granted: true }),
    });
    expect(res.status).toBe(201);
  });

  it('user B pausing user A\'s session gets the SAME status+body as pausing a session that never existed', async () => {
    const pauseOther = await fetch(`${base}/api/v1/session/camera/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}`, 'x-session-id': sessionId },
      body: JSON.stringify({ active: false }),
    });
    const pauseAbsent = await fetch(`${base}/api/v1/session/camera/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}`, 'x-session-id': neverExistedId },
      body: JSON.stringify({ active: false }),
    });
    expect(pauseOther.status).toBe(pauseAbsent.status);
    expect(await pauseOther.json()).toEqual(await pauseAbsent.json());
  });

  it('user B revoking user A\'s session gets the SAME status+body as revoking one that never existed', async () => {
    const revokeOther = await fetch(`${base}/api/v1/session/camera`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenB}`, 'x-session-id': sessionId },
    });
    const revokeAbsent = await fetch(`${base}/api/v1/session/camera`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenB}`, 'x-session-id': neverExistedId },
    });
    expect(revokeOther.status).toBe(revokeAbsent.status);
    expect(await revokeOther.json()).toEqual(await revokeAbsent.json());
  });

  it('user A\'s session was NOT revoked by user B\'s attempt (still owned by A, still pausable by A)', async () => {
    const res = await fetch(`${base}/api/v1/session/camera/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}`, 'x-session-id': sessionId },
      body: JSON.stringify({ active: true }),
    });
    expect(res.status).toBe(200);
  });
});

describe('★ O-?? fix — TRAP 2 CREATE path: consent no longer squats a shared session-id namespace', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const sessionId = `takeover-${crypto.randomUUID()}`;
  let tokenA = '';
  let tokenB = '';
  beforeAll(async () => {
    tokenA = await fakeSupabaseToken(userA);
    tokenB = await fakeSupabaseToken(userB);
  });

  it('A grants consent, B grants consent on the SAME id, A retains control of the session', async () => {
    const grantA = await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}`, 'x-session-id': sessionId },
      body: JSON.stringify({ granted: true }),
    });
    expect(grantA.status).toBe(201);

    // ⛔ B grants consent on the identical session id A is using.
    const grantB = await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}`, 'x-session-id': sessionId },
      body: JSON.stringify({ granted: true }),
    });
    expect(grantB.status).toBe(201);

    // ⛔ A is NOT locked out: A can still read/pause its own session.
    const aState = await fetch(`${base}/api/v1/session/camera/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}`, 'x-session-id': sessionId },
      body: JSON.stringify({ active: true }),
    });
    expect(aState.status).toBe(200);

    // ⛔ A can still revoke its own session (the revocation guarantee holds).
    const aRevoke = await fetch(`${base}/api/v1/session/camera`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenA}`, 'x-session-id': sessionId },
    });
    expect(aRevoke.status).toBe(200);

    // B's own session (created by B's grant) is untouched by A's revoke —
    // B can still pause/read it.
    const bState = await fetch(`${base}/api/v1/session/camera/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}`, 'x-session-id': sessionId },
      body: JSON.stringify({ active: true }),
    });
    expect(bState.status).toBe(200);
  });

  it('no create-path enumeration oracle: consent grant on a fresh id vs. one already owned by someone else is byte-identical', async () => {
    const alreadyOwnedId = `oracle-taken-${crypto.randomUUID()}`;
    const freshId = `oracle-fresh-${crypto.randomUUID()}`;
    const owner = crypto.randomUUID();
    const prober = crypto.randomUUID();
    const ownerToken = await fakeSupabaseToken(owner);
    const proberToken = await fakeSupabaseToken(prober);

    await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}`, 'x-session-id': alreadyOwnedId },
      body: JSON.stringify({ granted: true }),
    });

    const onTaken = await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${proberToken}`, 'x-session-id': alreadyOwnedId },
      body: JSON.stringify({ granted: true }),
    });
    const onFresh = await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${proberToken}`, 'x-session-id': freshId },
      body: JSON.stringify({ granted: true }),
    });

    expect(onTaken.status).toBe(onFresh.status);
    expect(await onTaken.json()).toEqual(await onFresh.json());
  });
});

describe('C7 Part B / TRAP 4 — a real turn persists a mood observation with NOT-NULL provenance', () => {
  it('POST /api/v1/mood/analyse (authenticated, live stack) → 200, and the row is readable back from Postgres', async () => {
    const userId = crypto.randomUUID();
    const token = await fakeSupabaseToken(userId);

    const res = await fetch(`${base}/api/v1/mood/analyse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: 'මට අද හොඳට දැනෙනවා.' }),
    });
    expect(res.status).toBe(200);

    // Persistence is fire-and-forget relative to the response — poll briefly.
    let row: { user_id: string; parameters_provenance: string | null; frame_count: number; session_elapsed_ms: number } | undefined;
    for (let i = 0; i < 20 && !row; i++) {
      const { rows } = await pool.query(
        'SELECT user_id, parameters_provenance, frame_count, session_elapsed_ms FROM mood_observations WHERE user_id = $1',
        [userId],
      );
      row = rows[0];
      if (!row) await new Promise((r) => setTimeout(r, 100));
    }

    expect(row).toBeDefined();
    expect(row!.user_id).toBe(userId);
    // ⛔ TRAP 4 — NOT NULL, and never the empty string.
    expect(row!.parameters_provenance).toBeTruthy();
    expect(typeof row!.frame_count).toBe('number');
    expect(typeof row!.session_elapsed_ms).toBe('number');
  }, 20_000);
});

describe('C7 TRAP 1 — message text is persisted but never logged', () => {
  it('POST a message with a distinctive secret string: stored in Postgres verbatim; never appears in captured stdout', async () => {
    const userId = crypto.randomUUID();
    const token = await fakeSupabaseToken(userId);
    const secretMarker = `TRAP1-SECRET-${crypto.randomUUID()}`;

    const createRes = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(createRes.status).toBe(201);
    const { id: conversationId } = (await createRes.json()) as { id: string };

    // Capture everything written to stdout while the message is posted.
    const originalWrite = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- delegating to the real writer with its original signature
      return (originalWrite as any)(chunk, ...rest);
    }) as typeof process.stdout.write;

    let postRes: Response;
    try {
      postRes = await fetch(`${base}/api/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: secretMarker }),
      });
    } finally {
      process.stdout.write = originalWrite;
    }
    expect(postRes.status).toBe(201);

    // Half 1 — never logged, at any level.
    expect(captured).not.toContain(secretMarker);

    // Half 2 — IS persisted, verbatim, in Postgres. (I1-B: the turn now also
    // persists an assistant reply row in the same conversation, so this
    // scopes to the user's row specifically rather than asserting a total count.)
    const { rows } = await pool.query(
      "SELECT content FROM messages WHERE conversation_id = $1 AND role = 'user'",
      [conversationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe(secretMarker);
  }, 20_000);
});
