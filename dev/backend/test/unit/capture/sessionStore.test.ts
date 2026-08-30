import { describe, expect, it } from 'vitest';
import { SessionStore } from '../../../src/capture/sessionStore.js';
import { computeTurnFaceEvidence } from '../../../src/capture/turnFaceEvidence.js';

const V = (o: Partial<Record<string, number>>): Record<string, number> => ({
  angry: 0, disgust: 0, fear: 0, happy: 0, neutral: 0, sad: 0, surprise: 0, ...o,
});

describe('SessionStore — pause ≠ revocation ≠ sign-out', () => {
  it('consent grant creates an EMPTY accumulator', () => {
    const s = new SessionStore();
    const session = s.grantConsent('a', 0);
    expect(session.accumulator.count).toBe(0);
    expect(session.cameraActive).toBe(true);
  });

  it('⛔ nothing is accepted before consent', () => {
    const s = new SessionStore();
    expect(s.recordFrame('nope', V({ happy: 1 }), 'v', 1)).toEqual({ ok: false, reason: 'no_consent' });
    expect(s.setCameraActive('nope', false)).toBe(false);
  });

  it('✅ PAUSE RETAINS the running sum; re-activation continues it', () => {
    const s = new SessionStore();
    s.grantConsent('a', 0);
    s.recordFrame('a', V({ happy: 0.6, neutral: 0.4 }), 'v', 1);
    s.recordFrame('a', V({ happy: 0.6, neutral: 0.4 }), 'v', 2);
    expect(s.setCameraActive('a', false)).toBe(true); // pause
    // frame while paused is refused and contributes nothing
    expect(s.recordFrame('a', V({ sad: 1 }), 'v', 3)).toEqual({ ok: false, reason: 'camera_inactive' });
    expect(s.get('a')!.accumulator.count).toBe(2); // RETAINED
    s.setCameraActive('a', true); // resume
    s.recordFrame('a', V({ happy: 0.6, neutral: 0.4 }), 'v', 4);
    expect(s.get('a')!.accumulator.count).toBe(3); // continued, not restarted
  });

  it('⛔ REVOCATION purges immediately; a later turn has NO face evidence', () => {
    const s = new SessionStore();
    s.grantConsent('a', 0);
    s.recordFrame('a', V({ happy: 1 }), 'v', 1);
    s.revoke('a');
    expect(s.get('a')).toBeUndefined();
    expect(s.hasConsent('a')).toBe(false);
  });

  it('⛔ SIGN-OUT purges — asserted separately from revocation', () => {
    const s = new SessionStore();
    s.grantConsent('a', 0);
    s.recordFrame('a', V({ happy: 1 }), 'v', 1);
    s.signOut('a');
    expect(s.get('a')).toBeUndefined();
  });

  it('re-enable after revocation starts at count 0 — the withdrawn sum never resurrects', () => {
    const s = new SessionStore();
    s.grantConsent('a', 0);
    s.recordFrame('a', V({ happy: 1 }), 'v', 1);
    s.recordFrame('a', V({ happy: 1 }), 'v', 2);
    s.revoke('a');
    const re = s.grantConsent('a', 10);
    expect(re.accumulator.count).toBe(0);
    expect(re.accumulator.mean()).toBeNull();
  });

  it('⛔ NOT reset on message send — turn 2 averages from session start', () => {
    const s = new SessionStore();
    s.grantConsent('a', 0);
    s.recordFrame('a', V({ happy: 0.8, neutral: 0.2 }), 'v', 1);
    // "message sent" — compute the turn; must not mutate the accumulator
    const turn1 = computeTurnFaceEvidence(s.get('a')!.accumulator.snapshot(), 100);
    expect(turn1.frameCount).toBe(1);
    s.recordFrame('a', V({ happy: 0.4, neutral: 0.6 }), 'v', 2);
    const turn2 = computeTurnFaceEvidence(s.get('a')!.accumulator.snapshot(), 200);
    expect(turn2.frameCount).toBe(2); // averaged from the beginning, not reset
  });

  it('refresh: a new session id is an independent, empty accumulator; the old entry evicts on TTL', () => {
    const s = new SessionStore();
    s.grantConsent('page-1', 0);
    s.recordFrame('page-1', V({ happy: 1 }), 'v', 1);
    const fresh = s.grantConsent('page-2', 1000);
    expect(fresh.accumulator.count).toBe(0);
    const evicted = s.evictStale(500, 2000);
    expect(evicted).toContain('page-1');
  });
});
