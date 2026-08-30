/**
 * D-9 (conversation history, docs/integration/plan/D7_HISTORY_PLAN.md).
 *
 * Two layers, both against the REAL app assembly / REAL Postgres (matching
 * the O-21 pattern already used by authOwnershipAndPersistence.test.ts):
 *
 *   1. `listRecentMessages()` directly — ordering, bounding, per-conversation
 *      isolation, and the new-conversation-has-no-history baseline.
 *   2. The HTTP route — cross-conversation isolation end to end, and that a
 *      new conversation's first turn is unaffected by the history feature.
 *
 * ⛔ What this file deliberately does NOT attempt: capturing the literal
 * `messages` array handed to Groq. `LLM_PROVIDER` defaults to `mock` in this
 * test environment (LLM_PROVIDER is left unset, matching every other
 * integration test here), so no real Groq call happens either way. Proof
 * that history reaches `buildMessages()` correctly is covered at the unit
 * level in test/unit/llm/prompt.test.ts, which exercises the exact function
 * the route calls through `LlmService.generate()`. This file proves the
 * layer prompt.test.ts cannot: that the RIGHT ROWS, and ONLY the right rows,
 * are what gets fetched and handed to it.
 */
import type { webcrypto } from 'node:crypto';
import { SignJWT, generateKeyPair } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
type CryptoKey = webcrypto.CryptoKey;

let signingKey: CryptoKey;

// ⛔ NOT imported statically — env.ts validates eagerly at import time
// (`export const env = loadEnv()`), and these modules transitively import it
// via db/pool.ts. Every env var below is set in `beforeAll` FIRST, then these
// are imported dynamically, same as `buildApp` already is in this file and in
// authOwnershipAndPersistence.test.ts.
let listRecentMessages: typeof import('../../src/persistence/messages.js')['listRecentMessages'];
let insertMessage: typeof import('../../src/persistence/messages.js')['insertMessage'];
let createConversation: typeof import('../../src/persistence/conversations.js')['createConversation'];
let ensureUser: typeof import('../../src/persistence/users.js')['ensureUser'];

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
  const messagesModule = await import('../../src/persistence/messages.js');
  listRecentMessages = messagesModule.listRecentMessages;
  insertMessage = messagesModule.insertMessage;
  createConversation = (await import('../../src/persistence/conversations.js')).createConversation;
  ensureUser = (await import('../../src/persistence/users.js')).ensureUser;

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

describe('D-9 — listRecentMessages()', () => {
  it('a brand-new conversation has no history', async () => {
    const userId = crypto.randomUUID();
    await ensureUser(userId, pool);
    const conversation = await createConversation(userId, pool);
    const history = await listRecentMessages(conversation.id, 6, pool);
    expect(history).toEqual([]);
  });

  it('returns messages chronologically (oldest first), regardless of insertion order effects', async () => {
    const userId = crypto.randomUUID();
    await ensureUser(userId, pool);
    const conversation = await createConversation(userId, pool);
    const m1 = await insertMessage(conversation.id, 'user', 'first', pool);
    const m2 = await insertMessage(conversation.id, 'assistant', 'second', pool);
    const m3 = await insertMessage(conversation.id, 'user', 'third', pool);

    const history = await listRecentMessages(conversation.id, 6, pool);
    expect(history.map((m) => m.id)).toEqual([m1.id, m2.id, m3.id]);
    expect(history.map((m) => m.content)).toEqual(['first', 'second', 'third']);
  });

  it('is bounded: only the most recent `limit` rows are returned, still oldest-first', async () => {
    const userId = crypto.randomUUID();
    await ensureUser(userId, pool);
    const conversation = await createConversation(userId, pool);
    const inserted = [];
    for (let i = 0; i < 10; i++) {
      inserted.push(await insertMessage(conversation.id, i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`, pool));
    }

    const history = await listRecentMessages(conversation.id, 4, pool);
    expect(history).toHaveLength(4);
    // The LAST 4 inserted, still returned oldest-first.
    expect(history.map((m) => m.content)).toEqual(['msg-6', 'msg-7', 'msg-8', 'msg-9']);
  });

  it('limit 0 returns no history (the LLM_HISTORY_TURNS=0 case)', async () => {
    const userId = crypto.randomUUID();
    await ensureUser(userId, pool);
    const conversation = await createConversation(userId, pool);
    await insertMessage(conversation.id, 'user', 'hello', pool);

    const history = await listRecentMessages(conversation.id, 0, pool);
    expect(history).toEqual([]);
  });

  it('⛔ a different conversation ID never leaks its rows into this one\'s history', async () => {
    const userId = crypto.randomUUID();
    await ensureUser(userId, pool);
    const conversationA = await createConversation(userId, pool);
    const conversationB = await createConversation(userId, pool);

    await insertMessage(conversationA.id, 'user', 'A-secret-content', pool);
    await insertMessage(conversationB.id, 'user', 'B-secret-content', pool);

    const historyA = await listRecentMessages(conversationA.id, 6, pool);
    expect(historyA.map((m) => m.content)).toEqual(['A-secret-content']);
    expect(historyA.some((m) => m.content.includes('B-secret-content'))).toBe(false);
  });
});

describe('D-9 — cross-conversation isolation over HTTP', () => {
  const userA = crypto.randomUUID();
  let tokenA = '';
  beforeAll(async () => {
    tokenA = await fakeSupabaseToken(userA);
  });

  it('a message posted to conversation A never appears in conversation B\'s stored history', async () => {
    const createA = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const { id: conversationAId } = (await createA.json()) as { id: string };
    const createB = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const { id: conversationBId } = (await createB.json()) as { id: string };

    const marker = `ISOLATION-MARKER-${crypto.randomUUID()}`;
    const postA = await fetch(`${base}/api/v1/conversations/${conversationAId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ content: marker }),
    });
    expect(postA.status).toBe(201);

    const historyB = await listRecentMessages(conversationBId, 6, pool);
    expect(historyB.some((m) => m.content === marker)).toBe(false);

    const historyA = await listRecentMessages(conversationAId, 6, pool);
    expect(historyA.some((m) => m.content === marker)).toBe(true);
  }, 20_000);

  it('a fresh conversation\'s first turn still returns 201 (history fetch does not break the baseline path)', async () => {
    const createRes = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const { id: conversationId } = (await createRes.json()) as { id: string };

    const res = await fetch(`${base}/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ content: 'first ever message' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { content: string };
    expect(typeof body.content).toBe('string');
  }, 20_000);
});
