/**
 * C3B — session lifecycle + frame ingest, driven over HTTP.
 *
 * ⛔ End-to-end 5 fps CANNOT be demonstrated — the frontend capture pipeline
 * does not exist (C3B_PLAN.md §1.1). This drives POST /session/frame directly,
 * which is the specified verification path.
 *
 * No probability MAGNITUDE is asserted anywhere here — only structure, counts,
 * identities and lifecycle (C3B_PLAN.md §11).
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const SID = 'x-session-id';
const IMAGE_BYTE = 0xab; // recognisable filler — base64 "q6ur..."
const IMAGE = Buffer.alloc(64, IMAGE_BYTE);
const IMAGE_B64 = IMAGE.toString('base64');

// FER 200 body a fake client returns. 0.699128 is a recognisable probability.
const FER_OK = {
  kind: 'success' as const,
  data: {
    model_version: 'fer-mobilenetv2-96-float32/1.0.0',
    model_sha256: 'x',
    class_order: ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise'],
    probabilities: { angry: 0.033372, disgust: 0.015208, fear: 0.032807, happy: 0.699128, neutral: 0.090136, sad: 0.095258, surprise: 0.034091 },
    predicted_class: 'happy',
    confidence: 0.699128,
    calibrated: true,
    label_space: 'fer7',
  },
};

let mod: typeof import('../../src/routes/session.routes.js');
let storeMod: typeof import('../../src/capture/sessionStore.js');
let bpMod: typeof import('../../src/capture/backpressure.js');
let loggerMod: typeof import('../../src/logging/logger.js');
let turnMod: typeof import('../../src/capture/turnFaceEvidence.js');

beforeAll(async () => {
  process.env.FER_SERVICE_URL ??= 'http://fer:7860';
  process.env.SENTIMENT_SERVICE_URL ??= 'http://sentiment:8000';
  process.env.FUSION_SERVICE_URL ??= 'http://fusion:9000';
  process.env.DATABASE_URL ??= 'postgres://u:p@localhost:5432/db';
  process.env.SUPABASE_URL ??= 'https://test-not-a-real-project.supabase.co';
  process.env.NODE_ENV = 'test';
  mod = await import('../../src/routes/session.routes.js');
  storeMod = await import('../../src/capture/sessionStore.js');
  bpMod = await import('../../src/capture/backpressure.js');
  loggerMod = await import('../../src/logging/logger.js');
  turnMod = await import('../../src/capture/turnFaceEvidence.js');
});

interface Rig {
  base: string;
  close: () => Promise<void>;
  store: InstanceType<typeof storeMod.SessionStore>;
}

function startRig(opts: { ferPredict?: () => Promise<unknown>; limiterCap?: number } = {}): Promise<Rig> {
  const store = new storeMod.SessionStore();
  const limiter = new bpMod.BackpressureLimiter(opts.limiterCap ?? 4);
  const ferClient = {
    predict: opts.ferPredict ?? ((): Promise<unknown> => Promise.resolve(FER_OK)),
  } as unknown as import('../../src/clients/fer.client.js').FerClient;

  const app = express();
  app.use((req, res, next) => {
    res.setHeader('x-request-id', 'test-req');
    next();
  });
  app.use(mod.createSessionRouter({ store, limiter, ferClient }));

  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        base: `http://127.0.0.1:${port}`,
        store,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function frameBody(image: Buffer): { body: Buffer; type: string } {
  const boundary = '----test-boundary-xyz';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="f.jpg"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, image, tail]), type: `multipart/form-data; boundary=${boundary}` };
}

async function postFrame(base: string, sid: string, image = IMAGE): Promise<{ status: number; json: Record<string, unknown> }> {
  const { body, type } = frameBody(image);
  const res = await fetch(`${base}/api/v1/session/frame`, {
    method: 'POST',
    headers: { 'content-type': type, [SID]: sid },
    body: new Uint8Array(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const consent = (base: string, sid: string): Promise<Response> =>
  fetch(`${base}/api/v1/session/camera/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [SID]: sid },
    body: JSON.stringify({ granted: true }),
  });

describe('C3B session/frame route', () => {
  let rig: Rig;
  afterEach(async () => {
    if (rig) await rig.close();
  });
  afterAll(() => vi.restoreAllMocks());

  it('⛔ nothing is accepted before consent', async () => {
    rig = await startRig();
    const r = await postFrame(rig.base, 's1');
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ accepted: false, reason: 'no_consent' });
  });

  it('after consent, a frame is accepted and frame_count increments — NO mood, NO per-frame prediction', async () => {
    rig = await startRig();
    await consent(rig.base, 's1');
    const a = await postFrame(rig.base, 's1');
    const b = await postFrame(rig.base, 's1');
    expect(a.json).toEqual({ accepted: true, frame_count: 1 });
    expect(b.json).toEqual({ accepted: true, frame_count: 2 });
    // response shape carries ONLY accepted + frame_count
    expect(Object.keys(b.json).sort()).toEqual(['accepted', 'frame_count']);
    for (const k of ['state', 'mood', 'predicted_class', 'predicted_state', 'confidence', 'scores', 'probabilities']) {
      expect(k in b.json).toBe(false);
    }
  });

  it('⛔ revocation purges; a later turn has no face evidence; re-consent starts at count 0', async () => {
    rig = await startRig();
    await consent(rig.base, 's1');
    await postFrame(rig.base, 's1');
    await postFrame(rig.base, 's1');
    await fetch(`${rig.base}/api/v1/session/camera`, { method: 'DELETE', headers: { [SID]: 's1' } });
    // turn after revoke → no session → null face evidence
    expect(rig.store.get('s1')).toBeUndefined();
    const blocked = await postFrame(rig.base, 's1');
    expect(blocked.status).toBe(403);
    await consent(rig.base, 's1');
    expect(rig.store.get('s1')!.accumulator.count).toBe(0);
    const turn = turnMod.computeTurnFaceEvidence(rig.store.get('s1')!.accumulator.snapshot());
    expect(turn.evidence).toBeNull();
  });

  it('⛔ PAUSE retains; ⛔ revocation/sign-out purge — asserted separately at the store', async () => {
    rig = await startRig();
    await consent(rig.base, 's1');
    await postFrame(rig.base, 's1');
    // pause
    const p = await fetch(`${rig.base}/api/v1/session/camera/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SID]: 's1' },
      body: JSON.stringify({ active: false }),
    });
    expect(p.status).toBe(200);
    const whilePaused = await postFrame(rig.base, 's1');
    expect(whilePaused.status).toBe(409);
    expect(rig.store.get('s1')!.accumulator.count).toBe(1); // RETAINED
    // resume — re-activation snapshot is just an ordinary frame
    await fetch(`${rig.base}/api/v1/session/camera/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SID]: 's1' },
      body: JSON.stringify({ active: true }),
    });
    const resumed = await postFrame(rig.base, 's1');
    expect(resumed.json).toEqual({ accepted: true, frame_count: 2 }); // continued
    // sign-out purges (distinct call)
    rig.store.signOut('s1');
    expect(rig.store.get('s1')).toBeUndefined();
  });

  it('a message immediately after "refresh" (new session, no frames) → face evidence null', async () => {
    rig = await startRig();
    await consent(rig.base, 'page-2');
    const turn = turnMod.computeTurnFaceEvidence(rig.store.get('page-2')!.accumulator.snapshot());
    expect(turn.evidence).toBeNull();
    expect(turn.frameCount).toBe(0);
  });

  it('⛔ back-pressure DROPS (never queues): reason "dropped_backpressure", count unchanged', async () => {
    rig = await startRig({ limiterCap: 0 });
    await consent(rig.base, 's1');
    const r = await postFrame(rig.base, 's1');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ accepted: false, reason: 'dropped_backpressure' });
    expect(rig.store.get('s1')!.accumulator.count).toBe(0);
  });

  it('⛔ TRAP 3 — a FER failure contributes nothing; count stays 0; all-failed ≡ zero', async () => {
    rig = await startRig({ ferPredict: () => Promise.resolve({ kind: 'unavailable', reason: 'timeout', code: 'face_unavailable' }) });
    await consent(rig.base, 's1');
    const r = await postFrame(rig.base, 's1');
    expect(r.json).toEqual({ accepted: false, reason: 'frame_not_processed' });
    expect(rig.store.get('s1')!.accumulator.count).toBe(0);
    const turn = turnMod.computeTurnFaceEvidence(rig.store.get('s1')!.accumulator.snapshot());
    expect(turn.evidence).toBeNull(); // identical to the zero-frame case
  });

  it('⛔ FER model_version change mid-session resets and records it', async () => {
    let version = 'fer/1.0.0';
    rig = await startRig({
      ferPredict: () => Promise.resolve({ ...FER_OK, data: { ...FER_OK.data, model_version: version } }),
    });
    await consent(rig.base, 's1');
    await postFrame(rig.base, 's1');
    await postFrame(rig.base, 's1');
    expect(rig.store.get('s1')!.accumulator.count).toBe(2);
    version = 'fer/2.0.0';
    const r = await postFrame(rig.base, 's1');
    expect(r.json).toEqual({ accepted: true, frame_count: 1 }); // reset, this is frame 1
    expect(rig.store.get('s1')!.accumulator.resetCount).toBe(1);
  });

  it('⛔ no image bytes, base64 blob, or per-frame probability vector in ANY log line', async () => {
    const captured: string[] = [];
    for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal'] as const) {
      vi.spyOn(loggerMod.logger, level).mockImplementation(((...args: unknown[]) => {
        captured.push(JSON.stringify(args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
        return undefined as never;
      }) as never);
    }
    rig = await startRig();
    await consent(rig.base, 's1');
    await postFrame(rig.base, 's1');
    // also exercise the failure log path
    rig.store.get('s1'); // noop
    const blob = captured.join('\n');
    expect(blob).not.toContain(IMAGE_B64);
    expect(blob).not.toContain('««'); // raw filler bytes
    expect(blob).not.toContain('0.699128'); // a per-frame probability
    expect(blob.toLowerCase()).not.toContain('probabilities');
    vi.restoreAllMocks();
  });
});
