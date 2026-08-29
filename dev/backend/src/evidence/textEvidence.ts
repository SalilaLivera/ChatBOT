/**
 * The text (sentiment) evidence adapter. Unlike faceEvidence.ts, this is NOT
 * exempt from MOOD_STATE_SPEC.md §A4's `predicted_state === argmax(scores)`
 * requirement (AMENDMENT 1 A1.6) — the sentiment model is natively 3-class,
 * so its label and its score vector come from one softmax and must agree.
 *
 * §3.6 / TRAP 2: the local argmax assertion uses IDENTICAL tie-break
 * semantics to fusion's own `argmax_state()` (dev/fusion/fusion/contract.py)
 * — ties broken by the first maximum in `calm, neutral, distressed` order,
 * matching numpy argmax. A naive "last max wins" implementation would
 * disagree with fusion on an exact tie and reject a valid response.
 *
 * `language` is ACCEPTED as an argument and emitted verbatim — this adapter
 * does not compute it; detection is C5. Text evidence therefore carries
 * FIVE keys, not four.
 *
 * No rounding is ever applied to `scores` — they are the sentiment service's
 * own `evidence` object, passed through unrounded (standing rule 5).
 */
import type { Scores, SubstantiveState } from './states.js';
import { argmaxState } from './states.js';

/** The exact §A4 shape for text evidence — the four base keys plus `language`. */
export interface TextEvidence {
  scores: Scores;
  predicted_state: SubstantiveState;
  confidence: number;
  model_version: string;
  language: string;
}

export class TextArgmaxDivergenceError extends Error {
  constructor(
    public readonly predictedState: string,
    public readonly expectedState: SubstantiveState,
  ) {
    super(
      `sentiment service predicted_state ${JSON.stringify(predictedState)} does not match argmax(scores) ${JSON.stringify(expectedState)} — text evidence is not exempt from §A4 (AMENDMENT 1 A1.6)`,
    );
    this.name = 'TextArgmaxDivergenceError';
  }
}

export interface TextEvidenceInput {
  /** The sentiment response's `evidence` object — verbatim, unrounded, lowercase keys. */
  evidence: Record<string, number>;
  /** The sentiment response's `predicted_label` — e.g. "CALM", "NEUTRAL", "DISTRESSED". */
  predictedLabel: string;
  confidence: number;
  modelVersion: string;
  /** Not computed here — supplied by the caller (C5's language detector). */
  language: string;
}

/**
 * Build §A4 text evidence. Throws TextArgmaxDivergenceError if the sentiment
 * service's own predicted_label disagrees with argmax(scores) — surfacing a
 * sentiment-service defect here, with context, instead of an opaque 500 from
 * fusion (§3.6).
 */
export function buildTextEvidence(input: TextEvidenceInput): TextEvidence {
  const scores: Scores = {
    calm: requireScore(input.evidence, 'calm'),
    neutral: requireScore(input.evidence, 'neutral'),
    distressed: requireScore(input.evidence, 'distressed'),
  };

  const predictedState = input.predictedLabel.toLowerCase() as SubstantiveState;
  const expected = argmaxState(scores);
  if (predictedState !== expected) {
    throw new TextArgmaxDivergenceError(predictedState, expected);
  }

  return {
    scores,
    predicted_state: predictedState,
    confidence: input.confidence,
    model_version: input.modelVersion,
    language: input.language,
  };
}

function requireScore(evidence: Record<string, number>, key: SubstantiveState): number {
  const v = evidence[key];
  if (typeof v !== 'number') {
    throw new Error(`sentiment evidence object is missing numeric key ${JSON.stringify(key)}`);
  }
  return v;
}
