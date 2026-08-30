/**
 * ★ C3B — the mean-vector → C3 adapter wiring (BACKEND_IMPLEMENTATION_PLAN.md
 * §3A.2, C3B_PLAN.md §3 / TRAP 2).
 *
 * At message-send time this turns the session accumulator into §A4 face
 * evidence by:
 *   1. taking the cumulative soft-averaged 7-vector (`accumulator.mean()`),
 *   2. deriving `predictedClass = argmax(mean 7-vector)`,
 *   3. calling the UNCHANGED C3 adapter (`buildFaceEvidence`) with that vector.
 *
 * The order is fixed: AVERAGE FIRST, MAP SECOND. Averaging after the mapping
 * would be averaging Rule-A labels — hard voting by another name (§3A.2).
 *
 * ⛔ This file does NOT group, map, renormalise, or fuse. It produces a mean
 * vector and CALLS the adapter. The 7→3 mapping lives in faceEvidence.ts
 * exactly once (C3B_PLAN.md §10, CI guard).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ TRAP 2 — deriving `predictedClass` is the ONE sanctioned exception
 *
 * C3's rule: `predicted_state` comes from the service's own `predicted_class`,
 * never re-derived from the probability object. A MEAN vector has no service
 * argmax — no single FER response corresponds to it — so C3B MUST compute
 * `argmax(mean)` and pass it in.
 *
 * §3A.2 sanctions this: "D-4 defines Rule A as a function from a 7-vector to a
 * label... Feeding it the mean 7-vector applies that function unchanged — the
 * rule governs the mapping, not the provenance of the vector it is given."
 *
 * ⚠ §3A.2 also calls this an INTERPRETATION the ML track should confirm — open
 * item C0.9, still UNANSWERED. Implemented as specified; the derivation site is
 * marked below as resting on C0.9. C3's single-frame semantics are untouched.
 *
 * The tie-break iterates `FER_SERVICE_CLASS_ORDER` (FER's own class order, the
 * order its numpy argmax used) so a derived argmax matches what the service
 * would have decided — mirrors C3's TRAP 2 reasoning exactly (C3B_PLAN.md §2.1).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildFaceEvidence, type FaceEvidence } from '../evidence/faceEvidence.js';
import { FER_SERVICE_CLASS_ORDER, type AccumulatorSnapshot, type FerProbabilities } from './frameAccumulator.js';

export interface TurnFaceEvidence {
  /** §A4 face evidence, or `null` when zero valid frames contributed — the
   *  zero-frame case: face evidence null → fusion §A6 text-only → 200. Normal
   *  operation, not an error (Part E). "all attempts failed" is identical. */
  evidence: FaceEvidence | null;
  /** §3A.8 instrumentation, recorded per turn alongside the mood observation. */
  frameCount: number;
  sessionElapsedMs: number;
}

/**
 * argmax over the mean 7-vector. Ties break to the FIRST maximum in FER's own
 * class order — see TRAP 2 above. ⚠ REST-ON-C0.9: this derivation of a label
 * from a mean vector is the interpretation §3A.2 records and the ML track has
 * not yet confirmed (open item C0.9).
 */
function argmaxMeanClass(mean: FerProbabilities): string {
  let bestClass: string = FER_SERVICE_CLASS_ORDER[0];
  let bestValue = mean[bestClass] as number;
  for (const c of FER_SERVICE_CLASS_ORDER.slice(1)) {
    const v = mean[c] as number;
    if (v > bestValue) {
      bestValue = v;
      bestClass = c;
    }
  }
  return bestClass;
}

/**
 * Build the turn's face evidence from the accumulator snapshot.
 *
 * ⛔ NO minimum-frame gate (§7.1): zero frames → `null`; one frame → the mean
 * of one vector IS that vector, used normally. Whether one frame *should*
 * qualify is open ML/product question Q-C3B-1 — not decided here.
 */
export function computeTurnFaceEvidence(snapshot: AccumulatorSnapshot, now: number = Date.now()): TurnFaceEvidence {
  const sessionElapsedMs = now - snapshot.startedAt;

  if (snapshot.count === 0 || snapshot.meanVector === null || snapshot.modelVersion === null) {
    return { evidence: null, frameCount: 0, sessionElapsedMs };
  }

  const mean = snapshot.meanVector;
  const predictedClass = argmaxMeanClass(mean); // ⚠ REST-ON-C0.9 — see file header / argmaxMeanClass

  const evidence = buildFaceEvidence({
    probabilities: mean,
    predictedClass,
    confidence: mean[predictedClass] as number,
    modelVersion: snapshot.modelVersion,
  });

  return { evidence, frameCount: snapshot.count, sessionElapsedMs };
}
