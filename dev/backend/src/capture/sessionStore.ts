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

/**
 * C7 TRAP 2 — the internal diagnostic distinguishes "no such session" from
 * "exists, but owned by someone else"; the route layer must map BOTH to the
 * identical externally-visible response and log only the diagnostic kind
 * server-side, so an authorisation attack stays observable without being an
 * enumeration oracle.
 */
export type OwnedLookupResult =
  | { kind: 'ok'; session: CameraSession }
  | { kind: 'not_found' }
  | { kind: 'wrong_owner' };

export class SessionStore {
  /** Legacy/unscoped sessions — created via the pre-C7 `grantConsent` (no
   *  owner). Kept as its own namespace so the pre-C7 test suite's calls to
   *  `get`/`setCameraActive`/`revoke`/`recordFrame` without an owner id keep
   *  working unmodified. */
  private readonly sessions = new Map<string, CameraSession>();
  /**
   * ★ O-?? fix — the CREATE path (`grantConsentForOwner`) used to write into
   * `sessions` above, a namespace SHARED by every user. A second user's
   * consent grant on the same client-supplied id silently displaced the
   * first user's session (took over ownership, discarded their evidence).
   *
   * Owned sessions are now keyed by the pair (verified `sub`, session id) —
   * a genuinely separate namespace per owner, so there is nothing to squat.
   * `ownedSessions` holds the data; `ownersBySessionId` is a diagnostic-only
   * index (sessionId -> the set of owners who currently hold that id) used
   * solely to distinguish the 'not_found' vs 'wrong_owner' kinds in
   * `getForOwner` for server-side logging — TRAP 2 still requires the route
   * layer to map BOTH to an identical external response.
   */
  private readonly ownedSessions = new Map<string, CameraSession>();
  private readonly ownersBySessionId = new Map<string, Set<string>>();

  /**
   * Composite-key separator. NUL cannot occur in a Supabase user id or a
   * session id, so `a` + `b c` can never collide with `a b` + `c`.
   *
   * Written as the ESCAPE \u0000, never as a literal NUL byte: a raw NUL
   * makes git classify this file as binary, and `git diff` then reports
   * only "Binary files differ" — leaving the most security-sensitive file
   * in C7 unreviewable before commit. The runtime value is identical.
   */
  private static readonly KEY_SEP = '\u0000';

  private static ownerKey(sessionId: string, ownerId: string): string {
    return `${ownerId}${SessionStore.KEY_SEP}${sessionId}`;
  }

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

  /** C7 — as `grantConsent`, scoped to `ownerId`'s own namespace (see class
   *  doc above). Never touches, reads, or displaces any other owner's — or
   *  the legacy unscoped — session under the same id string; a re-grant by
   *  the SAME owner discards only their own previous accumulator, exactly
   *  like `grantConsent` does in the unscoped namespace. */
  grantConsentForOwner(sessionId: string, ownerId: string, now: number = Date.now()): CameraSession {
    const session: CameraSession = {
      sessionId,
      consentGrantedAt: now,
      cameraActive: true,
      accumulator: new FrameAccumulator(now),
    };
    this.ownedSessions.set(SessionStore.ownerKey(sessionId, ownerId), session);
    let owners = this.ownersBySessionId.get(sessionId);
    if (!owners) {
      owners = new Set();
      this.ownersBySessionId.set(sessionId, owners);
    }
    owners.add(ownerId);
    return session;
  }

  get(sessionId: string): CameraSession | undefined {
    const direct = this.sessions.get(sessionId);
    if (direct) return direct;
    return this.soleOwnedSession(sessionId);
  }

  /** Best-effort fallback for legacy no-owner callers (unauthenticated test
   *  harnesses only — the real route always passes `ownerId` once a request
   *  is authenticated). Resolves only when exactly one owner currently holds
   *  `sessionId`, so it can never be used to reach across two concurrently
   *  squatting owners. */
  private soleOwnedSession(sessionId: string): CameraSession | undefined {
    const owners = this.ownersBySessionId.get(sessionId);
    if (!owners || owners.size !== 1) return undefined;
    const ownerId = owners.values().next().value;
    if (ownerId === undefined) return undefined;
    return this.ownedSessions.get(SessionStore.ownerKey(sessionId, ownerId));
  }

  /** Ownership-checked lookup (TRAP 2) — see `OwnedLookupResult`. A session
   *  granted via the pre-C7 `grantConsent` (no recorded owner) is treated as
   *  `not_found` for any owner — there is no owner it could match. */
  getForOwner(sessionId: string, ownerId: string): OwnedLookupResult {
    const session = this.ownedSessions.get(SessionStore.ownerKey(sessionId, ownerId));
    if (session) return { kind: 'ok', session };
    const owners = this.ownersBySessionId.get(sessionId);
    if (owners && owners.size > 0) return { kind: 'wrong_owner' };
    return { kind: 'not_found' };
  }

  hasConsent(sessionId: string): boolean {
    return this.sessions.has(sessionId) || this.ownersBySessionId.has(sessionId);
  }

  /** POST /session/camera/state — PAUSE / RESUME. ✅ RETAINS the accumulator.
   *  Returns false if consent was never granted (nothing to pause).
   *  `ownerId`, when supplied, scopes the mutation to that owner's own
   *  session only — required so an authenticated caller can never reach
   *  another owner's (or the legacy unscoped) entry through this call. */
  setCameraActiveForOwner(sessionId: string, active: boolean, ownerId: string): boolean {
    const session = this.ownedSessions.get(SessionStore.ownerKey(sessionId, ownerId));
    if (!session) return false;
    session.cameraActive = active;
    return true;
  }

  /** ⛔ LEGACY / UNSCOPED - pre-C7 callers only. Never reachable from an
   *  authenticated request; `requireAuth` runs ahead of every session route,
   *  so the routes call `setCameraActiveForOwner`. Kept so the C0-C6 suites
   *  keep exercising the original behaviour unmodified. */
  setCameraActive(sessionId: string, active: boolean): boolean {
    const session = this.get(sessionId);
    if (!session) return false;
    session.cameraActive = active;
    return true;
  }

  /** DELETE /session/camera — REVOKE. ⛔ PURGES immediately: the session entry
   *  and its seven floats are gone. Idempotent.
   *  With `ownerId`: purges only that owner's own session. Without it
   *  (legacy/unauthenticated callers only): purges the unscoped entry AND
   *  every owner-scoped entry sharing that id — safe because that call
   *  shape is never reachable once a request is authenticated (the route
   *  always passes `ownerId` in that case). */
  revokeForOwner(sessionId: string, ownerId: string): void {
    this.ownedSessions.delete(SessionStore.ownerKey(sessionId, ownerId));
    const owners = this.ownersBySessionId.get(sessionId);
    if (owners) {
      owners.delete(ownerId);
      if (owners.size === 0) this.ownersBySessionId.delete(sessionId);
    }
  }

  /** ⛔ LEGACY / UNSCOPED - pre-C7 callers only. Purges the unscoped entry
   *  AND every owner-scoped entry sharing that id. That cross-owner sweep is
   *  why this must never be reachable from an authenticated request: the
   *  routes call `revokeForOwner`, which cannot touch another owner. */
  revoke(sessionId: string): void {
    this.sessions.delete(sessionId);
    const owners = this.ownersBySessionId.get(sessionId);
    if (owners) {
      for (const owner of owners) this.ownedSessions.delete(SessionStore.ownerKey(sessionId, owner));
      this.ownersBySessionId.delete(sessionId);
    }
  }

  /** Sign-out. ⛔ PURGES — it ends the session outright. Distinct call from
   *  `revoke` so C3B can assert the two paths separately, even though the
   *  in-memory effect is identical (§3A.10.2). */
  signOutForOwner(sessionId: string, ownerId: string): void {
    this.revokeForOwner(sessionId, ownerId);
  }

  /** ⛔ LEGACY / UNSCOPED - pre-C7 callers only. */
  signOut(sessionId: string): void {
    this.revoke(sessionId);
  }

  /**
   * Add one valid FER 200 vector to the session's running sum.
   *
   * ⛔ Only reached for a valid FER success — the route drops every failure,
   * back-pressure rejection and no-face tick before this point (TRAP 3). The
   * re-activation snapshot (§3A.10.3) arrives here as an ORDINARY frame; there
   * is no special case. `ownerId`, when supplied, scopes the write to that
   * owner's own session only.
   */
  recordFrameForOwner(
    sessionId: string,
    probabilities: FerProbabilities,
    modelVersion: string,
    ownerId: string,
    now: number = Date.now(),
  ): RecordFrameResult {
    const session = this.ownedSessions.get(SessionStore.ownerKey(sessionId, ownerId));
    return this.applyFrame(session, probabilities, modelVersion, now);
  }

  /** ⛔ LEGACY / UNSCOPED - pre-C7 callers only. */
  recordFrame(
    sessionId: string,
    probabilities: FerProbabilities,
    modelVersion: string,
    now: number = Date.now(),
  ): RecordFrameResult {
    return this.applyFrame(this.get(sessionId), probabilities, modelVersion, now);
  }

  private applyFrame(
    session: CameraSession | undefined,
    probabilities: FerProbabilities,
    modelVersion: string,
    now: number,
  ): RecordFrameResult {
    if (!session) return { ok: false, reason: 'no_consent' };
    if (!session.cameraActive) return { ok: false, reason: 'camera_inactive' };
    const { reset, count } = session.accumulator.addFrame(probabilities, modelVersion, now);
    return { ok: true, frameCount: count, reset };
  }

  /** TTL sweep — evicts sessions idle (no frame, or never any frame) for
   *  longer than `maxIdleMs`. Session end / timeout / close (§3A.4). Sweeps
   *  both the legacy unscoped namespace and every owner-scoped session. */
  evictStale(maxIdleMs: number, now: number = Date.now()): string[] {
    const evicted: string[] = [];
    for (const [id, session] of this.sessions) {
      const last = session.accumulator.lastFrameAt ?? session.accumulator.startedAt;
      if (now - last > maxIdleMs) {
        this.sessions.delete(id);
        evicted.push(id);
      }
    }
    for (const [sessionId, owners] of this.ownersBySessionId) {
      for (const ownerId of [...owners]) {
        const session = this.ownedSessions.get(SessionStore.ownerKey(sessionId, ownerId));
        if (!session) continue;
        const last = session.accumulator.lastFrameAt ?? session.accumulator.startedAt;
        if (now - last > maxIdleMs) {
          this.ownedSessions.delete(SessionStore.ownerKey(sessionId, ownerId));
          owners.delete(ownerId);
          evicted.push(sessionId);
        }
      }
      if (owners.size === 0) this.ownersBySessionId.delete(sessionId);
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
