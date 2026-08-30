/**
 * ★ C7 (post-review) — the owner-scoped mutating API requires `ownerId`.
 *
 * ⛔ THE DEFECT THIS CLOSES. `setCameraActive`, `revoke` and `recordFrame`
 * previously took `ownerId?` — OPTIONAL. Omitting it did not fail; it fell
 * through to the shared unscoped namespace. TypeScript could not catch the
 * omission, so a single missed call site would have silently reopened the
 * cross-owner access C7 exists to close, with every test still green.
 *
 * The API is now split by NAME rather than by argument count:
 *   `*ForOwner`  — requires `ownerId`; reaches ONLY that owner's session
 *   plain names — explicitly LEGACY/UNSCOPED, pre-C7 suites only
 *
 * Omission is now a compile error rather than a silent downgrade. These
 * tests assert the runtime half: the two namespaces never see each other.
 */
import { describe, expect, it } from 'vitest';
import { SessionStore } from '../../../src/capture/sessionStore.js';
import type { FerProbabilities } from '../../../src/capture/frameAccumulator.js';

const PROBS = {
  angry: 0, disgust: 0, fear: 0, happy: 1, neutral: 0, sad: 0, surprise: 0,
} as unknown as FerProbabilities;

describe('owner-scoped mutations cannot reach another owner', () => {
  it('setCameraActiveForOwner does not pause a different owner\'s session sharing the id', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    store.grantConsentForOwner('s1', 'user-b');

    expect(store.setCameraActiveForOwner('s1', false, 'user-a')).toBe(true);

    const a = store.getForOwner('s1', 'user-a');
    const b = store.getForOwner('s1', 'user-b');
    expect(a.kind === 'ok' && a.session.cameraActive).toBe(false); // A paused
    expect(b.kind === 'ok' && b.session.cameraActive).toBe(true);  // ⛔ B untouched
  });

  it('revokeForOwner purges only the caller\'s session, never the other owner\'s', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    store.grantConsentForOwner('s1', 'user-b');

    store.revokeForOwner('s1', 'user-a');

    // A can no longer reach it. The internal kind is `wrong_owner` rather
    // than `not_found` because the id genuinely still exists under B — an
    // accurate DIAGNOSTIC distinction that is never exposed: the route maps
    // both to one identical external response (TRAP 2, asserted separately
    // in the integration suite).
    expect(store.getForOwner('s1', 'user-a').kind).not.toBe('ok');
    expect(store.getForOwner('s1', 'user-b').kind).toBe('ok'); // ⛔ B survives
  });

  it('recordFrameForOwner accumulates into the caller\'s session only', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    store.grantConsentForOwner('s1', 'user-b');

    expect(store.recordFrameForOwner('s1', PROBS, 'v', 'user-a', 1).ok).toBe(true);

    const a = store.getForOwner('s1', 'user-a');
    const b = store.getForOwner('s1', 'user-b');
    expect(a.kind === 'ok' && a.session.accumulator.snapshot().count).toBe(1);
    expect(b.kind === 'ok' && b.session.accumulator.snapshot().count).toBe(0); // ⛔ no leak
  });

  it('an owner with no session gets no_consent — it never falls back to the legacy entry', () => {
    const store = new SessionStore();
    store.grantConsent('s1'); // legacy/unscoped session with the SAME id

    expect(store.recordFrameForOwner('s1', PROBS, 'v', 'user-a', 1))
      .toEqual({ ok: false, reason: 'no_consent' });
    expect(store.setCameraActiveForOwner('s1', false, 'user-a')).toBe(false);
    // ⛔ the legacy entry is untouched by either owner-scoped call
    expect(store.get('s1')?.cameraActive).toBe(true);
  });

  it('the legacy unscoped API still behaves exactly as it did pre-C7', () => {
    const store = new SessionStore();
    store.grantConsent('s1');
    expect(store.setCameraActive('s1', false)).toBe(true);
    expect(store.recordFrame('s1', PROBS, 'v', 1)).toEqual({ ok: false, reason: 'camera_inactive' });
    store.revoke('s1');
    expect(store.get('s1')).toBeUndefined();
  });
});
