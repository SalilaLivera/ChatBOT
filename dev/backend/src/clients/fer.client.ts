/**
 * FER client — POST /predict, multipart/form-data, field name "image".
 * Returns the FER response verbatim and typed. No mapping, no
 * renormalisation, no grouping into mood states (§2.1 rule 1/2).
 */
import { randomBytes } from 'node:crypto';
import type { UpstreamHttpClient } from './httpClient.js';
import { sniffImageDimensions } from './imageDimensions.js';
import { mapFerError, FER_ALL_ERROR_CODES } from '../errors/upstreamMap.js';
import type { ClientOutcome, FerContractResponse, FerPredictResponse, UpstreamErrorEnvelope } from './types.js';
import { FER_CONTRACT } from './types.js';

// contract.py MAX_UPLOAD_BYTES / MIN_SOURCE_DIMENSION — mirrored here so an
// obviously invalid image costs no round trip (§ "the client-side checks").
export const FER_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const FER_MIN_SOURCE_DIMENSION = 16;

export class FerClient {
  constructor(private readonly http: UpstreamHttpClient) {}

  /**
   * Client-side pre-flight. Returns a rejection with NO HTTP call made when
   * the image is obviously invalid; otherwise null (proceed to predict()).
   */
  static preflight(imageBuffer: Buffer): { httpStatus: number; code: string; message: string } | null {
    if (imageBuffer.length === 0) {
      return { httpStatus: 400, code: 'face_image_rejected', message: 'No image was provided in the request.' };
    }
    if (imageBuffer.length > FER_MAX_UPLOAD_BYTES) {
      return {
        httpStatus: 413,
        code: 'face_image_too_large',
        message: 'The image exceeds the maximum accepted upload size.',
      };
    }
    const dims = sniffImageDimensions(imageBuffer);
    if (dims && (dims.width < FER_MIN_SOURCE_DIMENSION || dims.height < FER_MIN_SOURCE_DIMENSION)) {
      return {
        httpStatus: 400,
        code: 'face_image_rejected',
        message: 'The image is too small to be a usable face crop.',
      };
    }
    return null;
  }

  async predict(imageBuffer: Buffer, correlationId?: string): Promise<ClientOutcome<FerPredictResponse>> {
    const rejection = FerClient.preflight(imageBuffer);
    if (rejection) {
      return { kind: 'rejected', httpStatus: rejection.httpStatus, code: rejection.code, message: rejection.message };
    }

    const boundary = `----maternalink-${randomBytes(16).toString('hex')}`;
    const body = buildMultipartBody(boundary, imageBuffer);

    const outcome = await this.http.request({
      method: 'POST',
      path: '/predict',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
      correlationId,
    });

    if (!outcome.ok) {
      if (outcome.failure === 'circuit_open') {
        return { kind: 'unavailable', reason: 'circuit_open', code: 'face_unavailable' };
      }
      return {
        kind: 'unavailable',
        reason: outcome.failure === 'timeout' ? 'timeout' : 'connection_error',
        code: 'face_unavailable',
      };
    }

    const { status, text } = outcome.result;
    if (status >= 200 && status < 300) {
      return { kind: 'success', data: JSON.parse(text) as FerPredictResponse };
    }

    return mapErrorResponse(status, text);
  }

  /**
   * Startup readiness handshake (§9.6). Fails on ANY divergence from the
   * contract this code was written against — model_version, label_space, and
   * class_order as an ORDERED sequence, not a set (C3 indexes by that order).
   */
  async verifyContract(correlationId?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const outcome = await this.http.request({ method: 'GET', path: '/contract', correlationId });
    if (!outcome.ok) {
      return { ok: false, reason: `contract handshake failed: ${outcome.failure}` };
    }
    if (outcome.result.status !== 200) {
      return { ok: false, reason: `contract endpoint returned ${outcome.result.status}` };
    }
    const contract = JSON.parse(outcome.result.text) as FerContractResponse;
    if (contract.model_version !== FER_CONTRACT.modelVersion) {
      return {
        ok: false,
        reason: `model_version mismatch: expected ${FER_CONTRACT.modelVersion}, got ${contract.model_version}`,
      };
    }
    if (contract.label_space !== FER_CONTRACT.labelSpace) {
      return {
        ok: false,
        reason: `label_space mismatch: expected ${FER_CONTRACT.labelSpace}, got ${contract.label_space}`,
      };
    }
    const expected = FER_CONTRACT.classOrder;
    const actual = contract.class_order;
    const orderMatches =
      actual.length === expected.length && expected.every((name, i) => actual[i] === name);
    if (!orderMatches) {
      return {
        ok: false,
        reason: `class_order mismatch: expected [${expected.join(',')}], got [${actual.join(',')}]`,
      };
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
    // Not our envelope shape (e.g. a framework-level validation error) —
    // treat as an unavailable modality rather than guessing a code.
    return { kind: 'unavailable', reason: 'upstream_5xx', code: 'face_unavailable' };
  }

  const code = envelope.error.code;
  if (!FER_ALL_ERROR_CODES.has(code)) {
    // Unknown code — never fall through silently (§ exhaustiveness oracle).
    return { kind: 'unavailable', reason: 'upstream_5xx', code: 'face_unavailable' };
  }

  const mapped = mapFerError(code);
  // §9.5 / §9.6 — `detail` is internal only and is never included here.
  if (mapped.category === 'rejected') {
    return { kind: 'rejected', httpStatus: mapped.httpStatus, code: mapped.appCode, message: envelope.error.message };
  }
  return { kind: 'unavailable', reason: 'upstream_5xx', code: mapped.appCode };
}

function buildMultipartBody(boundary: string, imageBuffer: Buffer): Buffer {
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="image"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    'utf8',
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([preamble, imageBuffer, epilogue]);
}
