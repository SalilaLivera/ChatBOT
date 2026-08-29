/**
 * §6 — the full FER/sentiment error-code mapping. Switches on `code`, never
 * on `message` (messages may be reworded, codes may not).
 *
 * The two ALL_CODES sets below are transcribed from the respective
 * `errors.py` ALL_ERROR_CODES exports and used as an exhaustiveness oracle —
 * a test asserts this file's mapping covers each set exactly, so a code
 * added upstream fails a test instead of silently falling through a default.
 */

export type MappedCategory = 'rejected' | 'unavailable';

export interface MappedUpstreamError {
  category: MappedCategory;
  /** HTTP status this backend would use if surfacing the failure directly. */
  httpStatus: number;
  /** The backend's own code — never the upstream message. */
  appCode: string;
  /** Whether httpClient.ts may retry once. 503 is NEVER retried (§6.4). */
  retry: boolean;
  /** true only for model_load_failed / contract_violation — page an operator. */
  alert: boolean;
}

// ---------------------------------------------------------------------------
// FER — dev/fer-service/fer_service/errors.py ALL_ERROR_CODES
// ---------------------------------------------------------------------------

export const FER_ALL_ERROR_CODES = new Set([
  'missing_image',
  'unsupported_format',
  'invalid_image',
  'image_too_large',
  'image_too_small',
  'preprocessing_failed',
  'model_load_failed',
  'inference_failed',
  'contract_violation',
  'fer_error',
]);

const FER_MAP: Record<string, MappedUpstreamError> = {
  missing_image: { category: 'rejected', httpStatus: 400, appCode: 'face_image_rejected', retry: false, alert: false },
  invalid_image: { category: 'rejected', httpStatus: 400, appCode: 'face_image_rejected', retry: false, alert: false },
  image_too_small: { category: 'rejected', httpStatus: 400, appCode: 'face_image_rejected', retry: false, alert: false },
  unsupported_format: { category: 'rejected', httpStatus: 415, appCode: 'face_image_rejected', retry: false, alert: false },
  image_too_large: { category: 'rejected', httpStatus: 413, appCode: 'face_image_too_large', retry: false, alert: false },
  preprocessing_failed: { category: 'unavailable', httpStatus: 502, appCode: 'face_unavailable', retry: true, alert: false },
  inference_failed: { category: 'unavailable', httpStatus: 502, appCode: 'face_unavailable', retry: true, alert: false },
  contract_violation: { category: 'unavailable', httpStatus: 502, appCode: 'face_unavailable', retry: true, alert: true },
  // 503 — SHA-256 mismatch or absent model file. A deployment fault, not
  // transient. NEVER retried; the circuit opens and an operator is paged.
  model_load_failed: { category: 'unavailable', httpStatus: 503, appCode: 'face_unavailable', retry: false, alert: true },
  fer_error: { category: 'unavailable', httpStatus: 502, appCode: 'face_unavailable', retry: true, alert: false },
};

export function mapFerError(code: string): MappedUpstreamError {
  return (
    FER_MAP[code] ?? {
      category: 'unavailable',
      httpStatus: 502,
      appCode: 'face_unavailable',
      retry: false,
      alert: true,
    }
  );
}

// ---------------------------------------------------------------------------
// Sentiment — dev/sentiment-service/sentiment_service/errors.py ALL_ERROR_CODES
// ---------------------------------------------------------------------------

export const SENTIMENT_ALL_ERROR_CODES = new Set([
  'missing_text',
  'empty_text',
  'text_too_long',
  'tokenisation_failed',
  'model_load_failed',
  'inference_failed',
  'contract_violation',
  'sentiment_error',
]);

const SENTIMENT_MAP: Record<string, MappedUpstreamError> = {
  missing_text: { category: 'rejected', httpStatus: 400, appCode: 'text_rejected', retry: false, alert: false },
  empty_text: { category: 'rejected', httpStatus: 400, appCode: 'text_rejected', retry: false, alert: false },
  // Declared but unreachable on valid input — text is truncated at 512
  // tokens, never rejected on length. Mapped for completeness only (§2.1).
  text_too_long: { category: 'rejected', httpStatus: 413, appCode: 'text_rejected', retry: false, alert: false },
  tokenisation_failed: { category: 'unavailable', httpStatus: 502, appCode: 'text_unavailable', retry: true, alert: false },
  inference_failed: { category: 'unavailable', httpStatus: 502, appCode: 'text_unavailable', retry: true, alert: false },
  contract_violation: { category: 'unavailable', httpStatus: 502, appCode: 'text_unavailable', retry: true, alert: true },
  model_load_failed: { category: 'unavailable', httpStatus: 503, appCode: 'text_unavailable', retry: false, alert: true },
  sentiment_error: { category: 'unavailable', httpStatus: 502, appCode: 'text_unavailable', retry: true, alert: false },
};

export function mapSentimentError(code: string): MappedUpstreamError {
  return (
    SENTIMENT_MAP[code] ?? {
      category: 'unavailable',
      httpStatus: 502,
      appCode: 'text_unavailable',
      retry: false,
      alert: true,
    }
  );
}

/** Every mapping key file-local to this module — used by the exhaustiveness test. */
export const FER_MAPPED_CODES = new Set(Object.keys(FER_MAP));
export const SENTIMENT_MAPPED_CODES = new Set(Object.keys(SENTIMENT_MAP));
