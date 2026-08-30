/**
 * ★ C7 Part C — fixed-window rate limiting. Provisional engineering limits
 * (owner-decided); this test proves the MECHANISM (per-user and per-IP
 * enforcement, window reset), not the specific numbers, which are exercised
 * via env defaults elsewhere.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { FixedWindowLimiter, rateLimitMiddleware } from '../../../src/ratelimit/rateLimiter.js';

describe('FixedWindowLimiter', () => {
  it('allows up to max requests per key within the window, then rejects', () => {
    const limiter = new FixedWindowLimiter(60_000);
    const now = 1_000_000;
    expect(limiter.tryAcquire('k', 2, now)).toBe(true);
    expect(limiter.tryAcquire('k', 2, now)).toBe(true);
    expect(limiter.tryAcquire('k', 2, now)).toBe(false); // 3rd request in the same window
  });

  it('resets after the window elapses', () => {
    const limiter = new FixedWindowLimiter(1000);
    expect(limiter.tryAcquire('k', 1, 0)).toBe(true);
    expect(limiter.tryAcquire('k', 1, 500)).toBe(false);
    expect(limiter.tryAcquire('k', 1, 1500)).toBe(true); // new window
  });

  it('tracks keys independently', () => {
    const limiter = new FixedWindowLimiter(60_000);
    expect(limiter.tryAcquire('a', 1, 0)).toBe(true);
    expect(limiter.tryAcquire('b', 1, 0)).toBe(true); // unaffected by 'a'
  });
});

describe('rateLimitMiddleware — the face path is limited more tightly than text (§9.4)', () => {
  let server: Server;
  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  function startApp(perUserMax: number, ipMax: number): Promise<{ base: string; setUser: (id: string | undefined) => void }> {
    const perUserLimiter = new FixedWindowLimiter(60_000);
    const ipLimiter = new FixedWindowLimiter(60_000);
    let userId: string | undefined;
    const app = express();
    app.use((req, _res, next) => {
      // exactOptionalPropertyTypes: leave `userId` absent for the
      // unauthenticated case instead of assigning `undefined`.
      if (userId === undefined) delete req.userId;
      else req.userId = userId;
      next();
    });
    app.use(rateLimitMiddleware(perUserLimiter, perUserMax, ipLimiter, ipMax));
    app.get('/x', (_req, res) => res.status(200).json({ ok: true }));
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, setUser: (id) => (userId = id) });
      });
    });
  }

  it('rejects the request over the per-user quota with 429', async () => {
    const { base, setUser } = await startApp(2, 1000);
    setUser('user-1');
    const r1 = await fetch(`${base}/x`);
    const r2 = await fetch(`${base}/x`);
    const r3 = await fetch(`${base}/x`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });

  it('rejects over the per-IP aggregate even across different users', async () => {
    const { base, setUser } = await startApp(1000, 1);
    setUser('user-a');
    const r1 = await fetch(`${base}/x`);
    setUser('user-b');
    const r2 = await fetch(`${base}/x`); // same IP (loopback) — aggregate quota exhausted
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
  });
});
