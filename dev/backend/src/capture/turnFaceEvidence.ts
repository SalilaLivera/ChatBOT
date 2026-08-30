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
 * ✅ C0.9 RULED (ML track, 2026-08-30): applying Rule A to a mean 7-vector is an
 * APPLICATION of D-4, not an amendment to it. D-4 defines Rule A as a function
 * from a 7-vector to a label; its scope is the mapping, not the provenance of
 * the vector it is given — a mean vector is still a 7-vector, so the same
 * function applies unchanged.
 *
 * It is also NOT Rule B by another route: Rule B was rejected because it
 * collapses to three groups and then argmaxes the sums. Averaging FULL
 * 7-vectors and then applying Rule A preserves the seven-way structure Rule A
 * operates on — a different operation, so Rule B's rejection does not
 * transfer here.
 *
 * The result is a SESSION-LEVEL state, not a frame-level one, and no measured
 * figure characterises it: the 0.7681 three-state macro-F1 and the 24.3%
 * distress miss rate both describe single still images, and the FER test
 * split is spent, so that gap cannot be closed. C3's single-frame semantics
 * are untouched. This is decided, not pending.
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
 * class order — see TRAP 2 above. This derivation of a label from a mean
 * vector is the D-4 application ruled by the ML track 2026-08-30 (see file
 * header) — a session-level result with no measured figure behind it.
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
  const predictedClass = argmaxMeanClass(mean); // C0.9 RULED — see file header / argmaxMeanClass

  const evidence = buildFaceEvidence({
    probabilities: mean,
    predictedClass,
    confidence: mean[predictedClass] as number,
    modelVersion: snapshot.modelVersion,
  });

  return { evidence, frameCount: snapshot.count, sessionElapsedMs };
}
