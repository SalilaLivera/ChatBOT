/**
 * ★ Follow-up packet 3, step 3 — CORS. Driven over HTTP against the real app
 * assembly (`buildApp()`), same pattern as
 * test/integration/authOwnershipAndPersistence.test.ts. No Postgres, FER,
 * sentiment or fusion call is required for any assertion here — every case
 * either short-circuits on CORS/auth before a handler runs, or targets an
 * endpoint whose 401 does not touch the database.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ALLOWED_ORIGIN = 'https://maternalink-demo.vercel.app';
const OTHER_ALLOWED_ORIGIN = 'http://localhost:8081';
const DISALLOWED_ORIGIN = 'https://evil.example.com';

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= 'postgres://maternalink:changeme@localhost:5432/maternalink';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.FER_SERVICE_URL ??= 'http://localhost:7860';
  process.env.SENTIMENT_SERVICE_URL ??= 'http://localhost:8001';
  process.env.FUSION_SERVICE_URL ??= 'http://localhost:9000';
  process.env.CORS_ALLOWED_ORIGINS = `${ALLOWED_ORIGIN},${OTHER_ALLOWED_ORIGIN}`;

  const { buildApp } = await import('../../src/server.js');
  const app = buildApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('CORS — explicit origin allowlist (never *)', () => {
  it('an allowed origin gets Access-Control-Allow-Origin echoing that origin', async () => {
    const res = await fetch(`${base}/health`, {
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
  });

  it('a second configured allowed origin (Expo web localhost) also gets the header', async () => {
    const res = await fetch(`${base}/health`, {
      headers: { origin: OTHER_ALLOWED_ORIGIN },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(OTHER_ALLOWED_ORIGIN);
  });

  it('a disallowed origin does NOT get Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${base}/health`, {
      headers: { origin: DISALLOWED_ORIGIN },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('never echoes "*" — the response is a specific origin or absent, never a wildcard', async () => {
    const res = await fetch(`${base}/health`, {
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('an OPTIONS preflight for POST /api/v1/session/camera/consent succeeds and allows x-session-id', async () => {
    const res = await fetch(`${base}/api/v1/session/camera/consent`, {
      method: 'OPTIONS',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,x-session-id',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    const allowedHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(allowedHeaders).toContain('x-session-id');
    expect(allowedHeaders).toContain('authorization');
  });

  it('⛔ CORS does not bypass auth — an allowed origin with no bearer token still gets 401', async () => {
    const res = await fetch(`${base}/api/v1/mood/analyse`, {
      method: 'POST',
      headers: { origin: ALLOWED_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
  });
});
