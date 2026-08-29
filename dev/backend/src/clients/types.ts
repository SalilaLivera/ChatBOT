/**
 * Wire types transcribed verbatim from the FER and sentiment services' live
 * `/contract` and `/predict` responses (BACKEND_IMPLEMENTATION_PLAN.md §1.1,
 * §1.2). A client returns these shapes untouched — no mapping, no rounding,
 * no renormalisation (§2.1 rule 1).
 *
 * §2.1 rule 2: evidence/ is the only place that knows the seven FER classes
 * exist. FER_CONTRACT_CLASS_ORDER below is the ONE permitted exception — it
 * exists solely so the startup handshake can assert upstream's class_order
 * matches, ORDER included, the order this code was written against. It is
 * never read as a mood-state grouping and nothing in clients/ sums, maps, or
 * renormalises with it.
 */

// ---------------------------------------------------------------------------
// FER
// ---------------------------------------------------------------------------

export const FER_CONTRACT = {
  modelVersion: 'fer-mobilenetv2-96-float32/1.0.0',
  labelSpace: 'fer7',
  // ORDER IS LOAD-BEARING (contract.py CLASS_ORDER) — asserted as a sequence,
  // never as a set. A reordering upstream containing the same seven strings
  // must still fail the handshake.
  classOrder: ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise'] as const,
} as const;

export type FerClassName = (typeof FER_CONTRACT.classOrder)[number];

export interface FerContractResponse {
  model_version: string;
  service_version: string;
  label_space: string;
  class_order: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  calibration: Record<string, unknown>;
  limitations: string[];
  out_of_scope: string[];
}

/** Verbatim /predict success body. Values are opaque to clients/ — see §3.3. */
export interface FerPredictResponse {
  model_version: string;
  model_sha256: string;
  class_order: string[];
  probabilities: Record<string, number>;
  predicted_class: string;
  confidence: number;
  calibrated: boolean;
  label_space: string;
}

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------

export const SENTIMENT_CONTRACT = {
  modelVersion: 'sinbert_small_maternalink_mood_exp02/0.1.0',
  labelSpace: 'mood3',
  labelOrder: ['CALM', 'NEUTRAL', 'DISTRESSED'] as const,
  deployedEvidenceKeys: ['calm', 'neutral', 'distressed'] as const,
} as const;

export interface SentimentContractResponse {
  model_version: string;
  service_version: string;
  label_space: string;
  label_order: string[];
  deployed_evidence_keys: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  prediction_rule: string;
  device: string;
  dtype: string;
  supported_language: string;
  english_in_scope: boolean;
  checkpoint: Record<string, unknown>;
  provenance: Record<string, unknown>;
  measured_performance: Record<string, unknown>;
  limitations: string[];
  out_of_scope: string[];
  error_codes: string[];
}

/**
 * Verbatim /predict success body. `probabilities` is UPPERCASE-keyed,
 * `evidence` is lowercase-keyed — the backend consumes `evidence` (§1.2.1),
 * but this client passes both through unmodified; which one downstream code
 * reads is not this file's decision. No rounding is applied anywhere here.
 */
export interface SentimentPredictResponse {
  model_version: string;
  checkpoint_sha256: string;
  label_order: string[];
  probabilities: Record<string, number>;
  evidence: Record<string, number>;
  predicted_label: string;
  predicted_label_id: number;
  confidence: number;
  label_space: string;
  supported_language: string;
}

// ---------------------------------------------------------------------------
// Shared error envelope (both services serialise the same shape)
// ---------------------------------------------------------------------------

export interface UpstreamErrorEnvelope {
  error: {
    code: string;
    message: string;
    /** Present only when FER_DEBUG / SENTIMENT_DEBUG is on. Never forwarded to a client. */
    detail?: string;
  };
}

// ---------------------------------------------------------------------------
// Client outcome — the shape every clients/*.ts function returns.
//
// §6.5: a modality failure is NOT a request failure. Connection failure,
// timeout, 5xx (including the never-retried 503) surface as `unavailable` —
// a typed, non-thrown result the caller degrades on. A 4xx is the caller's
// fault (bad image / bad text) and surfaces as `rejected`, also non-thrown,
// carrying the mapped code and HTTP status for the route layer to use.
// ---------------------------------------------------------------------------

export type ClientOutcome<T> =
  | { kind: 'success'; data: T }
  | { kind: 'rejected'; httpStatus: number; code: string; message: string }
  | { kind: 'unavailable'; reason: 'timeout' | 'connection_error' | 'upstream_5xx' | 'circuit_open'; code: string };
