/**
 * Fusion client — POST /fuse, application/json
 * {"face_evidence": {...}|null, "text_evidence": {...}|null}. Deferred here
 * from C2 (D-5) because it needs the fusion wrapper's own /contract, which
 * did not exist until C4.
 *
 * Adds no numerical behaviour — face/text evidence objects are forwarded
 * exactly as built by src/evidence/ (C3). `null` is normal operation for
 * either key (camera off / text unavailable), never an error (§A6).
 */
import type { UpstreamHttpClient } from './httpClient.js';
import { mapFusionError, FUSION_ALL_ERROR_CODES } from '../errors/upstreamMap.js';
import type {
  ClientOutcome,
  FusionContractResponse,
  FusionHealthResponse,
  FusionOutput,
  UpstreamErrorEnvelope,
} from './types.js';
import { FUSION_CONTRACT } from './types.js';

export interface FuseRequest {
  faceEvidence: Record<string, unknown> | null;
  textEvidence: Record<string, unknown> | null;
}

export class FusionClient {
  constructor(private readonly http: UpstreamHttpClient) {}

  async fuse(request: FuseRequest, correlationId?: string): Promise<ClientOutcome<FusionOutput>> {
    const body = JSON.stringify({
      face_evidence: request.faceEvidence,
      text_evidence: request.textEvidence,
    });

    const outcome = await this.http.request({
      method: 'POST',
      path: '/fuse',
      headers: { 'content-type': 'application/json' },
      body,
      correlationId,
    });

    if (!outcome.ok) {
      if (outcome.failure === 'circuit_open') {
        return { kind: 'unavailable', reason: 'circuit_open', code: 'fusion_unavailable' };
      }
      return {
        kind: 'unavailable',
        reason: outcome.failure === 'timeout' ? 'timeout' : 'connection_error',
        code: 'fusion_unavailable',
      };
    }

    const { status, text } = outcome.result;
    if (status >= 200 && status < 300) {
      return { kind: 'success', data: JSON.parse(text) as FusionOutput };
    }

    return mapErrorResponse(status, text);
  }

  async health(correlationId?: string): Promise<
    { ok: true; data: FusionHealthResponse } | { ok: false; reason: string }
  > {
    const outcome = await this.http.request({ method: 'GET', path: '/health', correlationId });
    if (!outcome.ok) {
      return { ok: false, reason: `health check failed: ${outcome.failure}` };
    }
    if (outcome.result.status !== 200) {
      return { ok: false, reason: `health endpoint returned ${outcome.result.status}` };
    }
    return { ok: true, data: JSON.parse(outcome.result.text) as FusionHealthResponse };
  }

  /**
   * Startup readiness handshake. Fails on divergence from the contract this
   * code was written against, AND asserts that the one language code this
   * backend currently depends on ("si") is accepted by fusion's live
   * SINHALA_LANGUAGE_CODES — C5's detector does not exist yet, so this
   * checks the constant, not a detector, per C4_PLAN.md §6.
   */
  async verifyContract(correlationId?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const outcome = await this.http.request({ method: 'GET', path: '/contract', correlationId });
    if (!outcome.ok) {
      return { ok: false, reason: `contract handshake failed: ${outcome.failure}` };
    }
    if (outcome.result.status !== 200) {
      return { ok: false, reason: `contract endpoint returned ${outcome.result.status}` };
    }
    const contract = JSON.parse(outcome.result.text) as FusionContractResponse;

    if (contract.fusion_version !== FUSION_CONTRACT.fusionVersion) {
      return {
        ok: false,
        reason: `fusion_version mismatch: expected ${FUSION_CONTRACT.fusionVersion}, got ${contract.fusion_version}`,
      };
    }

    const expectedStates = FUSION_CONTRACT.substantiveStates;
    const actualStates = contract.substantive_states;
    const statesMatch =
      actualStates.length === expectedStates.length &&
      expectedStates.every((s, i) => actualStates[i] === s);
    if (!statesMatch) {
      return {
        ok: false,
        reason: `substantive_states mismatch: expected [${expectedStates.join(',')}], got [${actualStates.join(',')}]`,
      };
    }

    const liveVocabulary = new Set(contract.sinhala_language_codes.map((c) => c.toLowerCase()));
    for (const code of FUSION_CONTRACT.expectedLanguageVocabulary) {
      if (!liveVocabulary.has(code.toLowerCase())) {
        return {
          ok: false,
          reason: `expected language code ${JSON.stringify(code)} is not in fusion's live sinhala_language_codes [${contract.sinhala_language_codes.join(',')}] — text evidence carrying it would be silently discarded`,
        };
      }
    }

    return { ok: true };
  }
}

function mapErrorResponse(status: number, text: string): ClientOutcome<never> {
  let envelope: UpstreamErrorEnvelope | undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      envelope = parsed as UpstreamErrorEnvelope;
    }
  } catch {
    envelope = undefined;
  }

  if (!envelope || typeof envelope.error?.code !== 'string') {
    return { kind: 'unavailable', reason: 'upstream_5xx', code: 'fusion_unavailable' };
  }

  const code = envelope.error.code;
  if (!FUSION_ALL_ERROR_CODES.has(code)) {
    return { kind: 'unavailable', reason: 'upstream_5xx', code: 'fusion_unavailable' };
  }

  const mapped = mapFusionError(code);
  // detail is internal only — never included here, mirroring fer/sentiment clients.
  if (mapped.category === 'rejected') {
    return { kind: 'rejected', httpStatus: mapped.httpStatus, code: mapped.appCode, message: envelope.error.message };
  }
  return { kind: 'unavailable', reason: 'upstream_5xx', code: mapped.appCode };
}
