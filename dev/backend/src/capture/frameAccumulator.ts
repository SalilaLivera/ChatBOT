/**
 * ★ C3B — the session frame accumulator (BACKEND_IMPLEMENTATION_PLAN.md §3A.3,
 * C3B_PLAN.md §2).
 *
 * The cumulative soft average of §3A: the arithmetic mean of every calibrated
 * 7-class probability vector collected since the session (grant) began. It is
 * recomputed on demand; nothing here is per-turn or windowed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ STRUCTURAL PRIVACY PROPERTY (§9.5, §3A.3, C3B_PLAN.md §2)
 *
 * This type holds SEVEN float64 accumulators and a handful of scalars — and it
 * has NOWHERE to put a frame, a crop, a per-frame FER response, or a history
 * array. That is deliberate and load-bearing: at 5 fps a 20-minute session is
 * 6,000 frames, and the retained state stays seven numbers and an integer
 * regardless. If a reviewer can find a field on this class that COULD hold an
 * image, the design is wrong — not merely the usage.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⛔ TRAP 1 — keyed by class NAME, never by positional index (C3B_PLAN.md §2.1,
 * D-18). Two different seven-class orders exist in the committed tree
 * (`FER_CONTRACT.classOrder` vs `FER_CLASSES` in faceEvidence.ts). A positional
 * `sum[7]` array filled in one order and read in the other is a silent
 * corruption. The running sum here is an object keyed by the FER class string.
 *
 * ⛔ TRAP 3 — a frame that is not a valid FER 200 contributes NOTHING. This
 * class is only ever handed a real probability vector; it never fabricates a
 * zero / uniform / "artificial neutral" observation. `count` increments only in
 * `addFrame`, which is only called on a valid FER success (C3B_PLAN.md §5.1).
 *
 * Float64 accumulation over ~10^4 values of magnitude <= 1 carries relative
 * error far below the 1e-6 tolerance that matters downstream (§3.3). No
 * compensated summation. §3.3 renormalisation stays inside the C3 adapter.
 *
 * ⛔ FER `model_version` change mid-session (a deploy) → reset the accumulator
 * and record the reset. Averaging vectors from two model versions silently
 * mixes two distributions (§3A.4, C3B_PLAN.md §2).
 */
import { FER_CONTRACT } from '../clients/types.js';

/** The service's own class order — the order FER's numpy argmax used. Argmax
 *  tie-breaks iterate this so a DERIVED argmax matches what the service would
 *  have decided (C3B_PLAN.md §2.1, mirrors C3's TRAP 2). */
export const FER_SERVICE_CLASS_ORDER = FER_CONTRACT.classOrder;

export type FerProbabilities = Record<string, number>;

/** Read-only view of the accumulator for a turn — carries the mean vector and
 *  the §3A.8 instrumentation, and nothing that could hold an image. */
export interface AccumulatorSnapshot {
  count: number;
  modelVersion: string | null;
  startedAt: number;
  lastFrameAt: number | null;
  /** `sum[class] / count`, keyed by FER class name. `null` when count === 0. */
  meanVector: FerProbabilities | null;
  /** How many times a mid-session model_version change forced a reset. */
  resetCount: number;
}

export class ModelVersionResetError extends Error {
  constructor(
    public readonly previous: string,
    public readonly next: string,
  ) {
    super(`FER model_version changed mid-session: ${JSON.stringify(previous)} -> ${JSON.stringify(next)}; accumulator reset`);
    this.name = 'ModelVersionResetError';
  }
}

function zeroSum(): FerProbabilities {
  const s: FerProbabilities = {};
  for (const c of FER_SERVICE_CLASS_ORDER) s[c] = 0;
  return s;
}

export interface AddFrameResult {
  /** true when this frame triggered a model_version reset before it was added. */
  reset: boolean;
  count: number;
}

export class FrameAccumulator {
  /** Running element-wise sum, keyed by class NAME (TRAP 1). float64. */
  private sum: FerProbabilities = zeroSum();
  private _count = 0;
  private _modelVersion: string | null = null;
  private _lastFrameAt: number | null = null;
  private _resetCount = 0;
  readonly startedAt: number;

  constructor(now: number = Date.now()) {
    this.startedAt = now;
  }

  get count(): number {
    return this._count;
  }

  get modelVersion(): string | null {
    return this._modelVersion;
  }

  get lastFrameAt(): number | null {
    return this._lastFrameAt;
  }

  get resetCount(): number {
    return this._resetCount;
  }

  /**
   * Add ONE valid FER probability vector to the running sum.
   *
   * ⛔ Only call this for a valid FER 200. A dropped / timed-out / 4xx / 5xx /
   * 503 frame, or a tick where the client found no face, must never reach here
   * (C3B_PLAN.md §5.1, TRAP 3).
   *
   * If `modelVersion` differs from the version every prior contributing frame
   * came from, the accumulator is reset FIRST (sum zeroed, count 0), the reset
   * is recorded, and then this frame is added as the first frame of the new
   * model version.
   */
  addFrame(probabilities: FerProbabilities, modelVersion: string, now: number = Date.now()): AddFrameResult {
    // Defensive: the caller only hands us a validated FER 200 body, but a
    // malformed vector must fabricate NOTHING — throw so the caller drops it.
    for (const c of FER_SERVICE_CLASS_ORDER) {
      if (typeof probabilities[c] !== 'number' || !Number.isFinite(probabilities[c])) {
        throw new TypeError(`FER probability vector missing finite value for class ${JSON.stringify(c)}`);
      }
    }

    let didReset = false;
    if (this._modelVersion !== null && this._modelVersion !== modelVersion) {
      this.reset();
      didReset = true;
    }

    for (const c of FER_SERVICE_CLASS_ORDER) {
      this.sum[c] = (this.sum[c] ?? 0) + (probabilities[c] as number);
    }
    this._count += 1;
    this._modelVersion = modelVersion;
    this._lastFrameAt = now;

    return { reset: didReset, count: this._count };
  }

  /** Zero the running sum and count. Retains `startedAt`; bumps `resetCount`.
   *  Used on a mid-session model_version change (§3A.4). */
  reset(): void {
    this.sum = zeroSum();
    this._count = 0;
    this._modelVersion = null;
    this._resetCount += 1;
  }

  /** The cumulative soft average — `sum[class] / count`, keyed by class name.
   *  `null` when no valid frame has contributed (zero-frame case → face
   *  evidence `null` → text-only, §3A.4 / Part E). */
  mean(): FerProbabilities | null {
    if (this._count === 0) return null;
    const m: FerProbabilities = {};
    for (const c of FER_SERVICE_CLASS_ORDER) {
      m[c] = (this.sum[c] as number) / this._count;
    }
    return m;
  }

  snapshot(): AccumulatorSnapshot {
    return {
      count: this._count,
      modelVersion: this._modelVersion,
      startedAt: this.startedAt,
      lastFrameAt: this._lastFrameAt,
      meanVector: this.mean(),
      resetCount: this._resetCount,
    };
  }

  /** Number of retained float slots — always 7, independent of frame count.
   *  Exposed so a test can assert the O(1) property structurally. */
  retainedSlotCount(): number {
    return Object.keys(this.sum).length;
  }
}
