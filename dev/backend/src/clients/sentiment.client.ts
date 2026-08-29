/**
 * Sentiment client — POST /predict, application/json {"text": "..."}, never
 * multipart. The string is passed byte-for-byte: no trimming, no case
 * folding, no normalisation (standing rule 6 — text_normalisation: "none").
 * No rounding is ever applied to the returned probabilities (standing rule
 * 5) — the service deliberately serialises full float precision.
 */
import type { UpstreamHttpClient } from './httpClient.js';
import { mapSentimentError, SENTIMENT_ALL_ERROR_CODES } from '../errors/upstreamMap.js';
import type {
  ClientOutcome,
  SentimentContractResponse,
  SentimentPredictResponse,
  UpstreamErrorEnvelope,
} from './types.js';
import { SENTIMENT_CONTRACT } from './types.js';

export class SentimentClient {
  constructor(private readonly http: UpstreamHttpClient) {}

  async predict(text: string, correlationId?: string): Promise<ClientOutcome<SentimentPredictResponse>> {
    // No client-side validation of the text itself — the service's own
    // missing_text / empty_text codes are the authority (§6.2), and this
    // client must not reject anything the service would accept, or diverge
    // from it on what counts as valid.
    const body = JSON.stringify({ text });

    const outcome = await this.http.request({
      method: 'POST',
      path: '/predict',
      headers: { 'content-type': 'application/json' },
      body,
      correlationId,
    });

    if (!outcome.ok) {
      if (outcome.failure === 'circuit_open') {
        return { kind: 'unavailable', reason: 'circuit_open', code: 'text_unavailable' };
      }
      return {
        kind: 'unavailable',
        reason: outcome.failure === 'timeout' ? 'timeout' : 'connection_error',
        code: 'text_unavailable',
      };
    }

    const { status, text: responseText } = outcome.result;
    if (status >= 200 && status < 300) {
      return { kind: 'success', data: JSON.parse(responseText) as SentimentPredictResponse };
    }

    return mapErrorResponse(status, responseText);
  }

  /**
   * Startup readiness handshake (§9.6). label_order and deployed_evidence_keys
   * are asserted as ORDERED sequences — index order is load-bearing (§1.2).
   */
  async verifyContract(correlationId?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const outcome = await this.http.request({ method: 'GET', path: '/contract', correlationId });
    if (!outcome.ok) {
      return { ok: false, reason: `contract handshake failed: ${outcome.failure}` };
    }
    if (outcome.result.status !== 200) {
      return { ok: false, reason: `contract endpoint returned ${outcome.result.status}` };
    }
    const contract = JSON.parse(outcome.result.text) as SentimentContractResponse;
    if (contract.model_version !== SENTIMENT_CONTRACT.modelVersion) {
      return {
        ok: false,
        reason: `model_version mismatch: expected ${SENTIMENT_CONTRACT.modelVersion}, got ${contract.model_version}`,
      };
    }
    if (contract.label_space !== SENTIMENT_CONTRACT.labelSpace) {
      return {
        ok: false,
        reason: `label_space mismatch: expected ${SENTIMENT_CONTRACT.labelSpace}, got ${contract.label_space}`,
      };
    }
    if (!sequenceEquals(contract.label_order, SENTIMENT_CONTRACT.labelOrder)) {
      return {
        ok: false,
        reason: `label_order mismatch: expected [${SENTIMENT_CONTRACT.labelOrder.join(',')}], got [${contract.label_order.join(',')}]`,
      };
    }
    if (!sequenceEquals(contract.deployed_evidence_keys, SENTIMENT_CONTRACT.deployedEvidenceKeys)) {
      return {
        ok: false,
        reason: `deployed_evidence_keys mismatch: expected [${SENTIMENT_CONTRACT.deployedEvidenceKeys.join(',')}], got [${contract.deployed_evidence_keys.join(',')}]`,
      };
    }
    return { ok: true };
  }
}

function sequenceEquals(actual: string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((v, i) => actual[i] === v);
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
    // Not our envelope shape (e.g. FastAPI's own 422 body validation error) —
    // treat as an unavailable modality rather than guessing a code.
    return { kind: 'unavailable', reason: 'upstream_5xx', code: 'text_unavailable' };
  }

  const code = envelope.error.code;
  if (!SENTIMENT_ALL_ERROR_CODES.has(code)) {
    return { kind: 'unavailable', reason: 'upstream_5xx', code: 'text_unavailable' };
  }

  const mapped = mapSentimentError(code);
  if (mapped.category === 'rejected') {
    return { kind: 'rejected', httpStatus: mapped.httpStatus, code: mapped.appCode, message: envelope.error.message };
  }
  return { kind: 'unavailable', reason: 'upstream_5xx', code: mapped.appCode };
}
