/**
 * ★ C7 TRAP 2 — session ownership on `SessionStore`, additive to the pre-C7
 * API (see sessionStore.ts header: `grantConsent`/`get`/`setCameraActive`/
 * `revoke`/`recordFrame` keep their exact signatures for the pre-C7 test
 * file `sessionStore.test.ts`, which is exercised unmodified elsewhere).
 *
 * ★ C7 TRAP 3 — the restart test must not claim more than it proves: the
 * store stays in-memory (D-38), so "purge survives restart" is really
 * "everything is volatile". Both revoke->restart and grant+frames->restart
 * are asserted, and neither is described as a purge MECHANISM surviving —
 * see the comments below.
 */
import { describe, expect, it } from 'vitest';
import { SessionStore } from '../../../src/capture/sessionStore.js';

describe('SessionStore ownership (getForOwner / grantConsentForOwner)', () => {
  it('a session granted for one owner is only visible via getForOwner to that owner', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    expect(store.getForOwner('s1', 'user-a').kind).toBe('ok');
    expect(store.getForOwner('s1', 'user-b').kind).toBe('wrong_owner');
  });

  it('a session id that was never granted is "not_found" for any owner', () => {
    const store = new SessionStore();
    expect(store.getForOwner('nope', 'user-a').kind).toBe('not_found');
  });

  it('a session granted via the pre-C7 grantConsent (no owner recorded) is "not_found" for every owner', () => {
    const store = new SessionStore();
    store.grantConsent('legacy-session');
    expect(store.get('legacy-session')).toBeDefined(); // pre-C7 callers still see it
    expect(store.getForOwner('legacy-session', 'user-a').kind).toBe('not_found'); // no owner to match
  });

  it('revoke clears BOTH the session and its recorded owner (a re-grant under a new owner is not haunted by the old one)', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    store.revoke('s1');
    store.grantConsentForOwner('s1', 'user-b');
    expect(store.getForOwner('s1', 'user-a').kind).not.toBe('ok');
    expect(store.getForOwner('s1', 'user-b').kind).toBe('ok');
  });
});

describe('★ O-?? fix — grantConsentForOwner no longer shares a namespace across owners', () => {
  it('a second owner granting consent on the SAME session id does not affect the first owner\'s session', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    store.recordFrameForOwner('s1', { angry: 0, disgust: 0, fear: 0, happy: 1, neutral: 0, sad: 0, surprise: 0 } as never, 'v', 'user-a', 1);
    expect(store.getForOwner('s1', 'user-a').kind).toBe('ok');
    expect((store.getForOwner('s1', 'user-a') as { session: { accumulator: { count: number } } }).session.accumulator.count).toBe(1);

    // B grants consent on the identical id string.
    store.grantConsentForOwner('s1', 'user-b');

    // A's ownership, session, and accumulated frame are untouched.
    const aAfter = store.getForOwner('s1', 'user-a');
    expect(aAfter.kind).toBe('ok');
    expect((aAfter as { session: { accumulator: { count: number } } }).session.accumulator.count).toBe(1);

    // B's grant created B's OWN independent session with a fresh, empty accumulator.
    const bAfter = store.getForOwner('s1', 'user-b');
    expect(bAfter.kind).toBe('ok');
    expect((bAfter as { session: { accumulator: { count: number } } }).session.accumulator.count).toBe(0);

    // A can still pause, revoke, and analyse with it afterwards.
    expect(store.setCameraActiveForOwner('s1', false, 'user-a')).toBe(true);
    expect(store.getForOwner('s1', 'user-a').kind).toBe('ok');
    store.revokeForOwner('s1', 'user-a');
    expect(store.getForOwner('s1', 'user-a').kind).not.toBe('ok');
    // B is unaffected by A's revoke of A's own session.
    expect(store.getForOwner('s1', 'user-b').kind).toBe('ok');
  });

  it('no enumeration oracle: grantConsentForOwner behaves identically whether the id is fresh or already owned by someone else', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('taken', 'user-a');

    const freshResult = store.grantConsentForOwner('brand-new-id', 'user-b');
    const takenResult = store.grantConsentForOwner('taken', 'user-b');

    // Same shape of outcome for B in both cases: a fresh, empty, owned session.
    expect(freshResult.accumulator.count).toBe(0);
    expect(takenResult.accumulator.count).toBe(0);
    expect(store.getForOwner('brand-new-id', 'user-b').kind).toBe('ok');
    expect(store.getForOwner('taken', 'user-b').kind).toBe('ok');
  });
});

describe('C7 TRAP 3 — restart claims volatility, not a purge mechanism (D-38)', () => {
  it('revoke -> "restart" (a fresh SessionStore instance) -> absent', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    store.revoke('s1');
    // "Restart" = a brand-new in-memory store, exactly what a process
    // restart produces today (D-38 — no Redis, no dump to resurrect from).
    const afterRestart = new SessionStore();
    expect(afterRestart.get('s1')).toBeUndefined();
  });

  it('grant + frames (never revoked) -> "restart" -> ALSO absent — proving volatility, not a purge mechanism', () => {
    const store = new SessionStore();
    store.grantConsentForOwner('s1', 'user-a');
    store.recordFrame('s1', { angry: 0, disgust: 0, fear: 0, happy: 1, neutral: 0, sad: 0, surprise: 0 } as never, 'v');
    expect(store.get('s1')!.accumulator.count).toBe(1);
    // No revoke() call at all — yet a "restart" loses it exactly the same
    // way. This is the point: the guarantee rests on the store being
    // in-memory, not on any purge logic distinguishing the two cases.
    const afterRestart = new SessionStore();
    expect(afterRestart.get('s1')).toBeUndefined();
  });
});
