import { describe, expect, it } from 'vitest';
import { BackpressureLimiter } from '../../../src/capture/backpressure.js';

describe('BackpressureLimiter — DROP, never queue', () => {
  it('grants up to the cap, then DROPS (returns false) — nothing is buffered', () => {
    const l = new BackpressureLimiter(2);
    expect(l.tryAcquire('a')).toBe(true);
    expect(l.tryAcquire('a')).toBe(true);
    expect(l.tryAcquire('a')).toBe(false); // dropped
    expect(l.tryAcquire('a')).toBe(false); // still dropped — not queued behind the first two
    l.release('a');
    expect(l.tryAcquire('a')).toBe(true); // a slot freed, not a backlog drained
  });

  it('the limiter holds only a per-session integer count — no frame queue exists', () => {
    const l = new BackpressureLimiter(1);
    l.tryAcquire('a');
    l.tryAcquire('a'); // dropped
    // The only retained state is a Map<sessionId, number>. Assert no array/buffer field.
    for (const v of Object.values(l as unknown as Record<string, unknown>)) {
      expect(Array.isArray(v)).toBe(false);
      if (v instanceof Map) {
        for (const entry of v.values()) expect(typeof entry).toBe('number');
      }
    }
    expect(l.inFlightFor('a')).toBe(1);
  });

  it('per-session isolation: one session at its cap does not starve another', () => {
    const l = new BackpressureLimiter(1);
    expect(l.tryAcquire('a')).toBe(true);
    expect(l.tryAcquire('a')).toBe(false);
    expect(l.tryAcquire('b')).toBe(true);
  });

  it('forget() drops a purged session’s bookkeeping', () => {
    const l = new BackpressureLimiter(2);
    l.tryAcquire('a');
    l.forget('a');
    expect(l.inFlightFor('a')).toBe(0);
  });
});
