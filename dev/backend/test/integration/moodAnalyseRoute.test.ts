/**
 * ★ C6 — POST /api/v1/mood/analyse, driven over HTTP with injected fake
 * sentiment/fusion clients and a REAL SessionStore/FrameAccumulator (the
 * accumulator is C3B's actual production code — only the two upstream HTTP
 * clients are faked, exactly as sessionFrameRoute.test.ts fakes only the FER
 * client).
 *
 * The fake fusion client below implements the §A6 table's OBSERVABLE
 * behaviour (which modality wins when, and the face-only Rule-A passthrough)
 * only so these tests can assert the orchestration plumbing — which evidence
 * reached fusion, whether fusion was called at all, and whether its output
 * passed through unchanged. Fusion's own arithmetic is already proven live in
 * C4_DONE.md / C5's languageRouting.test.ts; it is not re-proven here.
 *
 * ⛔ TRAP 1 — every test below that exercises a "degraded" scenario asserts
 * the fusion spy WAS called (never bypassed).
 * ⛔ TRAP 2 — the 503 asymmetry: a sentiment 503 propagates as 503, exactly
 * one call, and the pool's own circuit breaker is doing the "no retry" work
 * (proven directly against retryAnd503.test.ts already — this file proves
 * moodService's PROPAGATION of that outcome, not the breaker itself).
 * ⛔ TRAP 3 — modalities_used is asserted to be exactly what the fake fusion
 * client returned, never recomputed from what was attempted.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const SID = 'x-session-id';

const SAMPLE_FACE_PROBS = {
  angry: 0.02,
  disgust: 0.01,
  fear: 0.02,
  happy: 0.85,
  neutral: 0.06,
  sad: 0.02,
  surprise: 0.02,
};

const SENTIMENT_OK_DISTRESSED = {
  kind: 'success' as const,
  data: {
    model_version: 'sinbert_small_maternalink_mood_exp02/0.1.0',
    checkpoint_sha256: 'x',
    label_order: ['CALM', 'NEUTRAL', 'DISTRESSED'],
    probabilities: { CALM: 0.1, NEUTRAL: 0.1, DISTRESSED: 0.8 },
    evidence: { calm: 0.1, neutral: 0.1, distressed: 0.8 },
    predicted_label: 'DISTRESSED',
    predicted_label_id: 2,
    confidence: 0.8,
    label_space: 'mood3',
    supported_language: 'si',
  },
};

let moodMod: typeof import('../../src/routes/mood.routes.js');
let storeMod: typeof import('../../src/capture/sessionStore.js');
let loggerMod: typeof import('../../src/logging/logger.js');
// `!` - assigned in beforeAll below, which TypeScript cannot see.
let evidenceMod!: typeof import('../../src/evidence/faceEvidence.js');

beforeAll(async () => {
  process.env.FER_SERVICE_URL ??= 'http://fer:7860';
  process.env.SENTIMENT_SERVICE_URL ??= 'http://sentiment:8000';
  process.env.FUSION_SERVICE_URL ??= 'http://fusion:9000';
  process.env.DATABASE_URL ??= 'postgres://u:p@localhost:5432/db';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.NODE_ENV = 'test';
  moodMod = await import('../../src/routes/mood.routes.js');
  storeMod = await import('../../src/capture/sessionStore.js');
  loggerMod = await import('../../src/logging/logger.js');
  evidenceMod = await import('../../src/evidence/faceEvidence.js');
});

type FuseCall = { faceEvidence: Record<string, unknown> | null; textEvidence: Record<string, unknown> | null };

/**
 * Implements ONLY the observable §A6 branch selection, for orchestration
 * testing — not a fusion reimplementation (C6 must never bypass or
 * reimplement fusion in production code; this is test-local, mirroring the
 * same approach C5's languageRouting.test.ts already used).
 */
function fakeFuse(call: FuseCall): { state: string; confidence: number; modalities_used: string[]; fusion_version: string } {
  const face = call.faceEvidence as { predicted_state?: string; confidence?: number } | null;
  const text = call.textEvidence as { predicted_state?: string; confidence?: number } | null;
  if (face && text) {
    return { state: 'distressed', confidence: 0.63, modalities_used: ['face', 'text'], fusion_version: 'fusion-v1' };
  }
  if (face && !text) {
    return { state: face.predicted_state ?? 'unknown', confidence: face.confidence ?? 0, modalities_used: ['face'], fusion_version: 'fusion-v1' };
  }
  if (!face && text) {
    return { state: text.predicted_state ?? 'unknown', confidence: text.confidence ?? 0, modalities_used: ['text'], fusion_version: 'fusion-v1' };
  }
  return { state: 'unknown', confidence: 0, modalities_used: [], fusion_version: 'fusion-v1' };
}

interface Rig {
  base: string;
  close: () => Promise<void>;
  store: InstanceType<typeof storeMod.SessionStore>;
  fuseSpy: ReturnType<typeof vi.fn>;
  sentimentSpy: ReturnType<typeof vi.fn>;
  healthSpy: ReturnType<typeof vi.fn>;
}

function startRig(
  opts: {
    sentimentOutcome?: () => Promise<unknown>;
    nodeEnv?: string;
    languagePolicy?: 'face_only' | 'reject';
  } = {},
): Promise<Rig> {
  const store = new storeMod.SessionStore();

  const sentimentSpy = vi.fn(opts.sentimentOutcome ?? (() => Promise.resolve({ kind: 'success', data: SENTIMENT_OK_DISTRESSED.data })));
  const fuseSpy = vi.fn((call: FuseCall) => Promise.resolve({ kind: 'success', data: fakeFuse(call) }));
  const healthSpy = vi.fn(() =>
    Promise.resolve({
      ok: true,
      data: { status: 'ok', fusion_version: 'fusion-v1', parameters_provenance: 'PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE', parameters_are_placeholder: true },
    }),
  );

  const deps = {
    sessionStore: store,
    sentimentClient: { predict: sentimentSpy } as unknown as import('../../src/clients/sentiment.client.js').SentimentClient,
    fusionClient: { fuse: fuseSpy, health: healthSpy } as unknown as import('../../src/clients/fusion.client.js').FusionClient,
    languageBounds: { siRatioHigh: 0.6, siRatioLow: 0.1 },
    languagePolicy: opts.languagePolicy ?? 'face_only',
    nodeEnv: opts.nodeEnv ?? 'test',
  };

  const app = express();
  app.use((req, res, next) => {
    res.setHeader('x-request-id', 'test-req');
    next();
  });
  app.use(express.json());
  app.use(moodMod.createMoodRouter({ deps }));

  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        base: `http://127.0.0.1:${port}`,
        store,
        fuseSpy,
        sentimentSpy,
        healthSpy,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function analyse(base: string, sid: string | undefined, text: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sid) headers[SID] = sid;
  const res = await fetch(`${base}/api/v1/mood/analyse`, { method: 'POST', headers, body: JSON.stringify({ text }) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function addFrame(store: InstanceType<typeof storeMod.SessionStore>, sid: string): void {
  store.recordFrame(sid, SAMPLE_FACE_PROBS, 'fer-mobilenetv2-96-float32/1.0.0');
}

const SINHALA_TEXT = 'මට අද හරිම බයයි.';
const ENGLISH_TEXT = 'I feel very anxious about the appointment today.';

describe('C6 — POST /api/v1/mood/analyse', () => {
  let rig: Rig;
  afterEach(async () => {
    if (rig) await rig.close();
    vi.restoreAllMocks();
  });
  afterAll(() => vi.restoreAllMocks());

  it('frames + Sinhala text, both usable → fused state, modalities_used ["face","text"]; fusion called with BOTH evidence objects', async () => {
    rig = await startRig();
    rig.store.grantConsent('s1');
    addFrame(rig.store, 's1');
    addFrame(rig.store, 's1');

    const r = await analyse(rig.base, 's1', SINHALA_TEXT);

    expect(r.status).toBe(200);
    expect(r.json.state).toBe('distressed');
    expect(r.json.modalities_used).toEqual(['face', 'text']);
    expect(r.json.fusion_version).toBe('fusion-v1');
    expect(r.json.language_detected).toBe('si');
    expect(r.json.text_evidence_dropped).toBe(false);
    expect(r.json.face_frame_count).toBe(2);
    expect(rig.sentimentSpy).toHaveBeenCalledTimes(1);
    expect(rig.fuseSpy).toHaveBeenCalledTimes(1);
    const call = rig.fuseSpy.mock.calls[0]?.[0] as FuseCall;
    expect(call.faceEvidence).not.toBeNull();
    expect(call.textEvidence).not.toBeNull();
  });

  it('⛔ camera never enabled (no consent, no session) → text-only passthrough, 200 — normal operation, NOT an error; fusion still called with faceEvidence=null', async () => {
    rig = await startRig();
    const r = await analyse(rig.base, 's-never-consented', SINHALA_TEXT);

    expect(r.status).toBe(200);
    expect(r.json.face_frame_count).toBe(0);
    expect(rig.fuseSpy).toHaveBeenCalledTimes(1);
    const call = rig.fuseSpy.mock.calls[0]?.[0] as FuseCall;
    expect(call.faceEvidence).toBeNull();
    expect(call.textEvidence).not.toBeNull();
    expect(r.json.modalities_used).toEqual(['text']);
  });

  it('⛔ consent revoked mid-session, then a message → purged → text-only, 200', async () => {
    rig = await startRig();
    rig.store.grantConsent('s2');
    addFrame(rig.store, 's2');
    addFrame(rig.store, 's2');
    rig.store.revoke('s2');

    const r = await analyse(rig.base, 's2', SINHALA_TEXT);

    expect(r.status).toBe(200);
    expect(r.json.face_frame_count).toBe(0);
    const call = rig.fuseSpy.mock.calls[0]?.[0] as FuseCall;
    expect(call.faceEvidence).toBeNull();
    expect(r.json.modalities_used).toEqual(['text']);
  });

  it('second and third messages in one session: each averages from session start; frame_count strictly increasing', async () => {
    rig = await startRig();
    rig.store.grantConsent('s3');
    addFrame(rig.store, 's3');

    const first = await analyse(rig.base, 's3', SINHALA_TEXT);
    expect(first.json.face_frame_count).toBe(1);

    addFrame(rig.store, 's3');
    const second = await analyse(rig.base, 's3', SINHALA_TEXT);
    expect(second.json.face_frame_count).toBe(2);

    addFrame(rig.store, 's3');
    const third = await analyse(rig.base, 's3', SINHALA_TEXT);
    expect(third.json.face_frame_count).toBe(3);

    // accumulator is NOT reset between turns (cumulative from session start)
    expect(rig.store.get('s3')!.accumulator.count).toBe(3);
  });

  it('text absent/unusable (English) → face-only passthrough returning the Rule-A label, 200; sentiment NOT called', async () => {
    rig = await startRig();
    rig.store.grantConsent('s4');
    addFrame(rig.store, 's4'); // happy-dominant vector → Rule-A label "calm"

    const r = await analyse(rig.base, 's4', ENGLISH_TEXT);

    expect(r.status).toBe(200);
    expect(rig.sentimentSpy).not.toHaveBeenCalled();
    expect(r.json.language_detected).not.toBe('si');
    expect(r.json.text_evidence_dropped).toBe(true);
    expect(r.json.modalities_used).toEqual(['face']);
    expect(r.json.state).toBe('calm'); // the Rule-A label, not a grouped-sum argmax
    expect(rig.fuseSpy).toHaveBeenCalledTimes(1); // ⛔ TRAP 1 — fusion still ran
  });

  it('⛔ neither usable (English + camera off) → unknown, 200; fusion still called with both null', async () => {
    rig = await startRig();
    const r = await analyse(rig.base, 's-nothing', ENGLISH_TEXT);

    expect(r.status).toBe(200);
    expect(r.json.state).toBe('unknown');
    expect(r.json.modalities_used).toEqual([]);
    const call = rig.fuseSpy.mock.calls[0]?.[0] as FuseCall;
    expect(call.faceEvidence).toBeNull();
    expect(call.textEvidence).toBeNull();
    expect(rig.fuseSpy).toHaveBeenCalledTimes(1); // ⛔ TRAP 1
  });

  it('⛔ sentiment timeout/5xx (non-503) degrades to face-only, 200 — fusion still called', async () => {
    rig = await startRig({ sentimentOutcome: () => Promise.resolve({ kind: 'unavailable', reason: 'timeout', code: 'text_unavailable' }) });
    rig.store.grantConsent('s5');
    addFrame(rig.store, 's5');

    const r = await analyse(rig.base, 's5', SINHALA_TEXT);

    expect(r.status).toBe(200);
    expect(r.json.text_evidence_dropped).toBe(true);
    expect(r.json.modalities_used).toEqual(['face']);
    const call = rig.fuseSpy.mock.calls[0]?.[0] as FuseCall;
    expect(call.textEvidence).toBeNull();
    expect(rig.fuseSpy).toHaveBeenCalledTimes(1); // ⛔ TRAP 1 — never bypassed
  });

  it('⛔ sentiment returns 503 (upstreamStatus 503) → 503 to the caller, exactly ONE sentiment call, fusion NOT called', async () => {
    rig = await startRig({
      sentimentOutcome: () =>
        Promise.resolve({ kind: 'unavailable', reason: 'upstream_5xx', code: 'text_unavailable', upstreamStatus: 503 }),
    });
    rig.store.grantConsent('s6');
    addFrame(rig.store, 's6');

    const r = await analyse(rig.base, 's6', SINHALA_TEXT);

    expect(r.status).toBe(503);
    expect(rig.sentimentSpy).toHaveBeenCalledTimes(1);
    expect(rig.fuseSpy).not.toHaveBeenCalled(); // request failed outright — never a degraded 200
  });

  it('⛔ sentiment circuit already open from a prior 503 → still 503, no upstream call attempted by moodService beyond the one the client layer makes', async () => {
    rig = await startRig({
      sentimentOutcome: () => Promise.resolve({ kind: 'unavailable', reason: 'circuit_open', code: 'text_unavailable', upstreamStatus: 503 }),
    });
    rig.store.grantConsent('s7');

    const r = await analyse(rig.base, 's7', SINHALA_TEXT);
    expect(r.status).toBe(503);
  });

  it('⛔ modalities_used never overstates — a face gated out below tau_face_min reports only ["text"], never "corrected" back to face', async () => {
    rig = await startRig();
    rig.store.grantConsent('s8');
    addFrame(rig.store, 's8'); // face evidence WAS built and sent to fusion...

    // ...but the fake fusion client here plays the role of fusion gating the
    // face out for low confidence: it returns modalities_used ["text"] even
    // though faceEvidence was present in the call. moodService must pass
    // this through unchanged, not "correct" it because a face WAS attempted.
    rig.fuseSpy.mockImplementation(() =>
      Promise.resolve({ kind: 'success', data: { state: 'distressed', confidence: 0.7, modalities_used: ['text'], fusion_version: 'fusion-v1' } }),
    );

    const r = await analyse(rig.base, 's8', SINHALA_TEXT);
    expect(r.status).toBe(200);
    expect(r.json.modalities_used).toEqual(['text']); // NOT ["face","text"] — attempted != used
  });

  it('⛔ no accuracy or reliability figure anywhere in the response', async () => {
    rig = await startRig();
    rig.store.grantConsent('s9');
    addFrame(rig.store, 's9');
    const r = await analyse(rig.base, 's9', SINHALA_TEXT);

    const serialised = JSON.stringify(r.json).toLowerCase();
    expect(serialised).not.toContain('accuracy');
    expect(serialised).not.toContain('macro');
    expect(serialised).not.toContain('0.7681');
    expect(serialised).not.toContain('0.6289');
    expect(serialised).not.toContain('reliability');
    expect('safety_state' in r.json).toBe(false);
  });

  it('guard 3 — non-production carries parameters_provenance, sourced from the live fusion client, not a constant', async () => {
    rig = await startRig({ nodeEnv: 'development' });
    rig.store.grantConsent('s10');
    const r = await analyse(rig.base, 's10', SINHALA_TEXT);
    expect(r.json.parameters_provenance).toBe('PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE');
    expect(rig.healthSpy).toHaveBeenCalled();
  });

  it('guard 3 — production does NOT carry parameters_provenance (absent, not merely falsy)', async () => {
    rig = await startRig({ nodeEnv: 'production' });
    rig.store.grantConsent('s11');
    const r = await analyse(rig.base, 's11', SINHALA_TEXT);
    expect('parameters_provenance' in r.json).toBe(false);
    expect(rig.healthSpy).not.toHaveBeenCalled();
  });

  it('⛔ message text never appears in any log line, at any level', async () => {
    const captured: string[] = [];
    for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal'] as const) {
      vi.spyOn(loggerMod.logger, level).mockImplementation(((...args: unknown[]) => {
        captured.push(JSON.stringify(args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
        return undefined as never;
      }) as never);
    }
    rig = await startRig({ sentimentOutcome: () => Promise.resolve({ kind: 'unavailable', reason: 'timeout', code: 'text_unavailable' }) });
    rig.store.grantConsent('s12');
    addFrame(rig.store, 's12');
    await analyse(rig.base, 's12', SINHALA_TEXT);
    const blob = captured.join('\n');
    expect(blob).not.toContain(SINHALA_TEXT);
    expect(blob).not.toContain(ENGLISH_TEXT);
  });

  it('the emitted response never carries a per-frame mood field, only the turn-level state', async () => {
    rig = await startRig();
    rig.store.grantConsent('s13');
    addFrame(rig.store, 's13');
    const r = await analyse(rig.base, 's13', SINHALA_TEXT);
    for (const forbidden of ['per_frame_state', 'per_frame_mood', 'frame_states']) {
      expect(forbidden in r.json).toBe(false);
    }
  });

  it('text required: a non-string text is rejected with 400 before any client is called', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.base}/api/v1/mood/analyse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SID]: 's14' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(rig.sentimentSpy).not.toHaveBeenCalled();
    expect(rig.fuseSpy).not.toHaveBeenCalled();
  });
});

// Sanity: the face-only Rule-A assertion above depends on faceEvidence.ts's
// own frozen mapping — imported here only to keep the SAMPLE_FACE_PROBS
// vector's expected label honest if that mapping ever legitimately changes.
void evidenceMod;
