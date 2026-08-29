/**
 * THE FER 7→3 evidence adapter. §2.1 rule 2: this is the ONLY place in the
 * backend that knows the seven FER classes exist. One exported mapping
 * constant, one exported function, one file.
 *
 * Builds TWO different quantities from the same 7-vector — neither replaces
 * the other (BACKEND_IMPLEMENTATION_PLAN.md §3.1, AMENDMENT 1 A1.2):
 *
 *   - `scores`          — grouped sums of the 7 calibrated probabilities,
 *                          renormalised (§3.3 — see below).
 *   - `predicted_state` — Rule A (D-4, FROZEN): the service's own 7-class
 *                          argmax, mapped through FER_TO_STATE. NEVER
 *                          re-derived from the probability object, and NEVER
 *                          derived from `scores`.
 *
 * ⚠ `predicted_state` MAY legitimately differ from argmax(scores) here — that
 * is AMENDMENT 1 A1.6, the face-only exemption from MOOD_STATE_SPEC.md §A4,
 * implemented at dev/fusion/fusion/contract.py (the `modality != "face"`
 * guard) and covered by fusion's own conformance check F14. Do NOT "fix" this
 * for consistency with the text adapter (textEvidence.ts) — they are
 * deliberately asymmetric. Forcing predicted_state to equal argmax(scores)
 * here would force one-hot face scores, turning face into an absolute veto
 * whenever the face weight dominates the fusion sum and destroying text's
 * ability to recover FER's measured 24.3% distress miss rate.
 *
 * ⚠ Renormalisation (§3.3) — NOT cosmetic. FER rounds each of its 7
 * probabilities to 6 dp; fusion validates the `scores` sum against 1e-6.
 * Measured over the 19 real FER fixtures: max |Σ grouped − 1.0| = 2.0e-6,
 * worst fixture fer_face_128_bmp.json, 4/19 fixtures over tolerance. Emitted
 * unrenormalised, roughly one FER response in five would be rejected by
 * fusion with contract_violation (HTTP 500). Dividing the three grouped sums
 * by their total changes no decision — argmax is not recomputed, Rule A is
 * untouched, proportions are preserved to float precision.
 *
 * Input is aggregation-agnostic by design (§ "input note", D-9): a 7-vector
 * plus predicted_class/confidence/model_version, NOT a FerResponse. C3B will
 * feed this a cumulative soft-averaged 7-vector without this file changing.
 */
import type { Scores, SubstantiveState } from './states.js';
import { SUBSTANTIVE_STATES } from './states.js';

export const FER_TO_STATE = {
  happy: 'calm',
  neutral: 'neutral',
  surprise: 'neutral',
  angry: 'distressed',
  disgust: 'distressed',
  fear: 'distressed',
  sad: 'distressed',
} as const satisfies Record<string, SubstantiveState>;

export type FerClassName = keyof typeof FER_TO_STATE;

const FER_CLASSES = Object.keys(FER_TO_STATE) as FerClassName[];

/** The exact §A4 shape for face evidence — exactly these four keys, in this order. */
export interface FaceEvidence {
  scores: Scores;
  predicted_state: SubstantiveState;
  confidence: number;
  model_version: string;
}

export class UnknownFerClassError extends Error {
  constructor(public readonly predictedClass: string) {
    super(
      `unrecognised FER predicted_class ${JSON.stringify(predictedClass)}; expected one of ${JSON.stringify(FER_CLASSES)}`,
    );
    this.name = 'UnknownFerClassError';
  }
}

export interface FaceEvidenceInput {
  /** The 7 calibrated probabilities, keyed by FER class name. */
  probabilities: Record<string, number>;
  /** FER's own argmax label — the source of Rule A, never re-derived. */
  predictedClass: string;
  /** FER's argmax probability. */
  confidence: number;
  modelVersion: string;
}

/**
 * Build §A4 face evidence from a 7-vector plus FER's own argmax fields.
 * Throws UnknownFerClassError on an unrecognised predicted_class — NEVER
 * silently mapped to neutral.
 */
export function buildFaceEvidence(input: FaceEvidenceInput): FaceEvidence {
  if (!isFerClassName(input.predictedClass)) {
    throw new UnknownFerClassError(input.predictedClass);
  }

  const grouped: Record<SubstantiveState, number> = { calm: 0, neutral: 0, distressed: 0 };
  for (const ferClass of FER_CLASSES) {
    const p = input.probabilities[ferClass];
    if (typeof p !== 'number') {
      throw new UnknownFerClassError(ferClass);
    }
    grouped[FER_TO_STATE[ferClass]] += p;
  }

  const total = grouped.calm + grouped.neutral + grouped.distressed;
  const scores: Scores = {
    calm: grouped.calm / total,
    neutral: grouped.neutral / total,
    distressed: grouped.distressed / total,
  };

  return {
    scores,
    predicted_state: FER_TO_STATE[input.predictedClass],
    confidence: input.confidence,
    model_version: input.modelVersion,
  };
}

function isFerClassName(value: string): value is FerClassName {
  return Object.prototype.hasOwnProperty.call(FER_TO_STATE, value);
}

// Re-exported so tests can assert key order without hand-typing it twice.
export { SUBSTANTIVE_STATES };
