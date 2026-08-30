/**
 * ★ C3B — per-session upstream back-pressure (BACKEND_IMPLEMENTATION_PLAN.md
 * §3A.6, C3B_PLAN.md §5 / Part C).
 *
 * Bounded per-session concurrency toward the FER service that ⛔ DROPS frames
 * rather than queueing them.
 *
 * ⛔ NO UNBOUNDED FRAME QUEUE MAY EXIST. A queue of camera frames is a latency
 * problem AND a privacy problem — it is a buffer of images, which §9.5 forbids.
 * There is no array of pending frames anywhere in this file: `tryAcquire`
 * either grants a slot now or refuses. A refused frame is gone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ WHY DROPPING IS SAFE HERE — AND WHY THE ARGUMENT DOES NOT GENERALISE
 *
 * The turn's output is an UNWEIGHTED CUMULATIVE MEAN over interchangeable
 * samples. Losing one frame shifts the mean by 1/count; queueing it would delay
 * every subsequent turn. A stale frame has no value in an average.
 *
 * This holds *because* the aggregation is an unweighted mean of interchangeable
 * observations. It would NOT hold for a weighted scheme, a most-recent-wins
 * scheme, or anything order-sensitive. Do not lift this policy to another
 * pipeline without re-checking that premise.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `maxInFlightPerSession` is an OPERATIONAL tuning value, not a
 * `[FUTURE-EXPERIMENTAL]` symbol and not a minimum-frame threshold (§7.1): it
 * governs upstream load, not whether the face modality is used. Its real value
 * is chosen after C8.4 measures the concurrent-user ceiling; 4 is a
 * conservative default that lets one client keep the pipe busy without
 * saturating a shared FER container.
 */

export const DEFAULT_MAX_IN_FLIGHT_PER_SESSION = 4;

export class BackpressureLimiter {
  private readonly inFlight = new Map<string, number>();

  constructor(private readonly maxInFlightPerSession: number = DEFAULT_MAX_IN_FLIGHT_PER_SESSION) {}

  /** Grant a slot if this session is under its concurrency cap, else refuse.
   *  ⛔ A refusal DROPS the frame — nothing is stored, nothing is retried. */
  tryAcquire(sessionId: string): boolean {
    const current = this.inFlight.get(sessionId) ?? 0;
    if (current >= this.maxInFlightPerSession) return false;
    this.inFlight.set(sessionId, current + 1);
    return true;
  }

  /** Release a slot acquired by `tryAcquire`. Safe to call once per successful
   *  acquire; never call it for a refused frame. */
  release(sessionId: string): void {
    const current = this.inFlight.get(sessionId) ?? 0;
    if (current <= 1) {
      this.inFlight.delete(sessionId);
      return;
    }
    this.inFlight.set(sessionId, current - 1);
  }

  /** Drop all slot bookkeeping for a session — called on revoke / sign-out so
   *  a purged session leaves nothing behind. */
  forget(sessionId: string): void {
    this.inFlight.delete(sessionId);
  }

  inFlightFor(sessionId: string): number {
    return this.inFlight.get(sessionId) ?? 0;
  }
}

/** Process-wide limiter. */
export const backpressureLimiter = new BackpressureLimiter();
