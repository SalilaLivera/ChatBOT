import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../../src/clients/httpClient.js';
import { FusionClient } from '../../../src/clients/fusion.client.js';
import { FakePool, asPool } from './fakePool.js';

const VALID_CONTRACT = {
  fusion_version: 'fusion-v1',
  substantive_states: ['calm', 'neutral', 'distressed'],
  all_fusion_states: ['calm', 'neutral', 'distressed', 'unknown'],
  fusion_output_keys: ['state', 'confidence', 'modalities_used', 'fusion_version'],
  sinhala_language_codes: ['si', 'sin', 'si-lk', 'sinhala', 'sinhalese'],
  required_symbols: ['W_face', 'W_text', 'tau_face_min', 'tau_text_min', 'tau_fusion_min', 'tau_distress'],
  error_codes: ['contract_violation', 'fusion_error', 'invalid_parameter', 'missing_parameter', 'missing_provenance'],
};

/** Exactly the §A7 contract — throws on any extra or missing key. */
function assertExactFusionOutputKeys(body: Record<string, unknown>): void {
  const expected = ['confidence', 'fusion_version', 'modalities_used', 'state'].sort();
  const actual = Object.keys(body).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected exactly ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

describe('⛔ TRAP — the /fuse 200 body must contain EXACTLY the four §A7 keys', () => {
  it('a leaking wrapper (dataclasses.asdict-style — scores/face_usable/text_usable/reason present) is CAUGHT', async () => {
    // Simulates the wrapper doing the WRONG thing (the C4_PLAN.md §2 trap:
    // dataclasses.asdict(result) or a response_model derived from the
    // dataclass) — proving the exact-key-set assertion below would catch
    // that defect rather than a happy-path "state is present" test missing it.
    const leaked = JSON.stringify({
      state: 'calm',
      confidence: 0.25,
      modalities_used: ['face'],
      fusion_version: 'fusion-v1',
      scores: { calm: 0.25, neutral: 0.25, distressed: 0.5 },
      face_usable: true,
      text_usable: false,
      reason: 'a6_face_only_passthrough_unweighted',
    });
    const pool = new FakePool([{ type: 'response', status: 200, text: leaked }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.fuse({ faceEvidence: null, textEvidence: null });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    // The client itself is transport-only and passes the body through
    // verbatim (§2.1 rule 1) — leak detection is this exact-key-set check,
    // not the client. It must throw on the leaked payload above.
    expect(() => assertExactFusionOutputKeys(result.data as unknown as Record<string, unknown>)).toThrow();
  });

  it('a correctly-shaped four-key response passes the same check', async () => {
    const clean = JSON.stringify({
      state: 'calm',
      confidence: 0.25,
      modalities_used: ['face'],
      fusion_version: 'fusion-v1',
    });
    const pool = new FakePool([{ type: 'response', status: 200, text: clean }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.fuse({ faceEvidence: null, textEvidence: null });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(Object.keys(result.data).sort()).toEqual(
      ['confidence', 'fusion_version', 'modalities_used', 'state'].sort(),
    );
  });
});

describe('fusion: 503 is never retried; detail is never forwarded', () => {
  it('503 makes exactly one upstream call', async () => {
    const body = JSON.stringify({ error: { code: 'missing_parameter', message: 'unavailable' } });
    const pool = new FakePool([{ type: 'response', status: 503, text: body }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.fuse({ faceEvidence: null, textEvidence: null });
    expect(pool.callCount).toBe(1);
    expect(result.kind).toBe('unavailable');
  });

  it('a contract_violation detail field never reaches the mapped result', async () => {
    const body = JSON.stringify({
      error: {
        code: 'contract_violation',
        message: 'A modality evidence object does not match the A4 evidence contract. Fusion refused to run.',
        detail: 'face evidence has undocumented key(s) not in the A4 contract: [request_id]',
      },
    });
    const pool = new FakePool([{ type: 'response', status: 500, text: body }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.fuse({ faceEvidence: { bad: 'shape' }, textEvidence: null });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('detail');
    expect(serialised).not.toContain('request_id');
  });

  it('a contract_violation stays mapped as a backend-defect unavailable, never a caller-facing rejection', async () => {
    const body = JSON.stringify({
      error: { code: 'contract_violation', message: 'refused to run' },
    });
    const pool = new FakePool([{ type: 'response', status: 500, text: body }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.fuse({ faceEvidence: { bad: 'shape' }, textEvidence: null });
    expect(result.kind).toBe('unavailable');
  });
});

describe('fusion startup handshake', () => {
  it('an unmutated /contract passes, including the sinhala vocabulary assertion', async () => {
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(VALID_CONTRACT) }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.verifyContract();
    expect(result.ok).toBe(true);
  });

  it('a mutated fusion_version fails the handshake', async () => {
    const mutated = { ...VALID_CONTRACT, fusion_version: 'fusion-v2' };
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(mutated) }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    const result = await client.verifyContract();
    expect(result.ok).toBe(false);
  });

  it('missing "si" from sinhala_language_codes fails the handshake — the C5 vocabulary guard', () => {
    const mutated = { ...VALID_CONTRACT, sinhala_language_codes: ['sin', 'si-lk', 'sinhala', 'sinhalese'] };
    const pool = new FakePool([{ type: 'response', status: 200, text: JSON.stringify(mutated) }]);
    const client = new FusionClient(
      new UpstreamHttpClient({ baseUrl: 'http://fusion', timeoutMs: 1000, pool: asPool(pool) }),
    );
    return client.verifyContract().then((result) => {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('si');
    });
  });
});
