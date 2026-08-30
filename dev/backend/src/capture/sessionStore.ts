/**
 * ★ C3B — camera session lifecycle (BACKEND_IMPLEMENTATION_PLAN.md §3A.4 /
 * §3A.10, C3B_PLAN.md §4 / Part B).
 *
 * A session is ONE PAGE INSTANCE (§3A.4, interim decision). It is keyed here by
 * a client-supplied session id (see the route layer). Two tabs are two
 * sessions for one user — open question Q9a, raised not assumed; this store
 * does NOT implement tab-sharing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ PAUSE ≠ REVOCATION — the two "off" states are never conflated (§3A.10.2)
 *
 *   pause  (camera toggled inactive)  → capture stops; consent still stands;
 *                                       accumulator RETAINED, untouched, in
 *                                       memory. Re-activation CONTINUES the
 *                                       cumulative average.
 *   revoke (consent withdrawn)        → session entry removed; the seven floats
 *                                       are dropped IMMEDIATELY. No carry-over,
 *                                       no "last known" value. Re-enabling
 *                                       starts a NEW empty accumulator — the
 *                                       withdrawn sum never resurrects.
 *   sign-out                          → same as revoke (purge). It ends the
 *                                       session outright. `store.ts` already
 *                                       sets cameraEnabled:false on signOut.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * IN-MEMORY BEHAVIOUR AT EACH TRANSITION (stated explicitly per Part B):
 *
 *   | transition       | the seven floats                                     |
 *   |------------------|-----------------------------------------------------|
 *   | pause            | retained in memory, unchanged; no new frames arrive  |
 *   | revocation       | dropped immediately; the session entry is removed    |
 *   | sign-out         | as revocation                                       |
 *   | refresh          | the old session id is simply never used again; its  |
 *   |                  | entry is evicted (TTL sweep) or replaced on re-grant |
 *   | process restart  | ⛔ NOTHING survives. This store is in-memory in C3B; |
 *   |                  | a restart cannot resurrect a purged — or any —      |
 *   |                  | accumulator.                                        |
 *
 * ⚠ C7 note: when the store is externalised to Redis, purge-on-revocation must
 * SURVIVE a restart and be re-asserted there — an RDB/AOF dump is state at rest
 * (§7A.8). This module is the enforcement point today; Redis becomes it later.
 *
 * ⛔ This module never touches the 7→3 mapping, fusion, or a per-frame mood.
 */
import { FrameAccumulator, type FerProbabilities } from './frameAccumulator.js';

export interface CameraSession {
  readonly sessionId: string;
  readonly consentGrantedAt: number;
  /** false = paused (camera toggled inactive). Consent still stands. */
  cameraActive: boolean;
  readonly accumulator: FrameAccumulator;
}

export type RecordFrameResult =
  | { ok: true; frameCount: number; reset: boolean }
  | { ok: false; reason: 'no_consent' | 'camera_inactive' };

export class SessionStore {
  private readonly sessions = new Map<string, CameraSession>();

  /** POST /session/camera/consent — creates a fresh, empty accumulator.
   *  A re-grant on the same id (e.g. a refresh reusing an id) discards the
   *  previous accumulator entirely — "from the beginning" means from THIS
   *  grant (§3A.4). */
  grantConsent(sessionId: string, now: number = Date.now()): CameraSession {
    const session: CameraSession = {
      sessionId,
      consentGrantedAt: now,
      cameraActive: true,
      accumulator: new FrameAccumulator(now),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): CameraSession | undefined {
    return this.sessions.get(sessionId);
  }

  hasConsent(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** POST /session/camera/state — PAUSE / RESUME. ✅ RETAINS the accumulator.
   *  Returns false if consent was never granted (nothing to pause). */
  setCameraActive(sessionId: string, active: boolean): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.cameraActive = active;
    return true;
  }

  /** DELETE /session/camera — REVOKE. ⛔ PURGES immediately: the session entry
   *  and its seven floats are gone. Idempotent. */
  revoke(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Sign-out. ⛔ PURGES — it ends the session outright. Distinct call from
   *  `revoke` so C3B can assert the two paths separately, even though the
   *  in-memory effect is identical (§3A.10.2). */
  signOut(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Add one valid FER 200 vector to the session's running sum.
   *
   * ⛔ Only reached for a valid FER success — the route drops every failure,
   * back-pressure rejection and no-face tick before this point (TRAP 3). The
   * re-activation snapshot (§3A.10.3) arrives here as an ORDINARY frame; there
   * is no special case.
   */
  recordFrame(sessionId: string, probabilities: FerProbabilities, modelVersion: string, now: number = Date.now()): RecordFrameResult {
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, reason: 'no_consent' };
    if (!session.cameraActive) return { ok: false, reason: 'camera_inactive' };
    const { reset, count } = session.accumulator.addFrame(probabilities, modelVersion, now);
    return { ok: true, frameCount: count, reset };
  }

  /** TTL sweep — evicts sessions idle (no frame, or never any frame) for
   *  longer than `maxIdleMs`. Session end / timeout / close (§3A.4). */
  evictStale(maxIdleMs: number, now: number = Date.now()): string[] {
    const evicted: string[] = [];
    for (const [id, session] of this.sessions) {
      const last = session.accumulator.lastFrameAt ?? session.accumulator.startedAt;
      if (now - last > maxIdleMs) {
        this.sessions.delete(id);
        evicted.push(id);
      }
    }
    return evicted;
  }

  /** Test / diagnostics only. */
  size(): number {
    return this.sessions.size;
  }
}

/** Process-wide store. In-memory (C7 externalises it). */
export const sessionStore = new SessionStore();
