import { describe, expect, it } from 'vitest';
import { FrameAccumulator, FER_SERVICE_CLASS_ORDER } from '../../../src/capture/frameAccumulator.js';

const V = (o: Partial<Record<string, number>>): Record<string, number> => {
  const base: Record<string, number> = { angry: 0, disgust: 0, fear: 0, happy: 0, neutral: 0, sad: 0, surprise: 0 };
  // Drop explicitly-undefined keys rather than widening the result type:
  // `Partial<...>` makes each value `number | undefined`, which a plain
  // spread would leak into `Record<string, number>`.
  for (const [k, v] of Object.entries(o)) if (v !== undefined) base[k] = v;
  return base;
};

describe('FrameAccumulator — keyed by class NAME, O(1), never fabricates', () => {
  it('the mean of ONE vector IS that vector (no special case)', () => {
    const acc = new FrameAccumulator(0);
    const v = V({ happy: 0.7, neutral: 0.1, sad: 0.2 });
    acc.addFrame(v, 'fer/1.0.0', 1);
    expect(acc.count).toBe(1);
    expect(acc.mean()).toEqual(v);
  });

  it('keyed by NAME: identical vectors sent in a SHUFFLED key order average identically (TRAP 1)', () => {
    const straight = new FrameAccumulator(0);
    const shuffled = new FrameAccumulator(0);
    const v = V({ happy: 0.4, neutral: 0.3, angry: 0.3 });
    // Same numbers, keys inserted in reverse order — a positional sum[7] would diverge.
    const reordered: Record<string, number> = {};
    for (const k of [...FER_SERVICE_CLASS_ORDER].reverse()) reordered[k] = v[k]!;
    straight.addFrame(v, 'v', 1);
    shuffled.addFrame(reordered, 'v', 1);
    expect(shuffled.mean()).toEqual(straight.mean());
  });

  it('cumulative mean over many frames stays within 1e-9 of the exact average (float64, no compensated sum)', () => {
    const acc = new FrameAccumulator(0);
    const a = V({ happy: 0.111111, neutral: 0.222222, sad: 0.333333, fear: 0.333334 });
    const b = V({ happy: 0.999999, neutral: 0.000001 });
    for (let i = 0; i < 5000; i++) acc.addFrame(a, 'v', i);
    for (let i = 0; i < 5000; i++) acc.addFrame(b, 'v', i);
    const mean = acc.mean()!;
    for (const c of FER_SERVICE_CLASS_ORDER) {
      expect(Math.abs(mean[c]! - (a[c]! + b[c]!) / 2)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('O(1): retained float slots and own-key surface are identical after 10 and after 10,000 frames', () => {
    const small = new FrameAccumulator(0);
    const big = new FrameAccumulator(0);
    for (let i = 0; i < 10; i++) small.addFrame(V({ happy: 0.5, neutral: 0.5 }), 'v', i);
    for (let i = 0; i < 10_000; i++) big.addFrame(V({ happy: 0.5, neutral: 0.5 }), 'v', i);
    expect(big.retainedSlotCount()).toBe(7);
    expect(small.retainedSlotCount()).toBe(7);
    // No array/history field appeared: enumerable own keys are the same set.
    expect(Object.keys(big).sort()).toEqual(Object.keys(small).sort());
    // Snapshot shape carries no frame/crop/history — only these keys.
    expect(Object.keys(big.snapshot()).sort()).toEqual(
      ['count', 'lastFrameAt', 'meanVector', 'modelVersion', 'resetCount', 'startedAt'].sort(),
    );
  });

  it('O(1): a 10-frame and a 10,000-frame accumulator have byte-identical retained shape', () => {
    // One frozen vector reused for every frame — no per-iteration garbage, so
    // what we measure is the RETAINED accumulator, not loop allocation.
    const frame = Object.freeze(V({ happy: 0.5, neutral: 0.5 }));
    const build = (n: number): FrameAccumulator => {
      const acc = new FrameAccumulator(0);
      for (let i = 0; i < n; i++) acc.addFrame(frame as Record<string, number>, 'v', i);
      return acc;
    };
    const small = build(10);
    const big = build(10_000);
    // keep both alive so neither is collected before measurement
    expect(small.count + big.count).toBe(10_010);

    // The O(1) guarantee is STRUCTURAL, and asserted here: the two
    // accumulators serialise to byte-identical state shape (only `count`
    // differs in value), and neither grew a slot or an array. A heap-delta
    // magnitude is NOT asserted — without --expose-gc it is dominated by
    // uncollected loop garbage, not by retained accumulator size. The
    // supervisor measures raw heap independently (plan §11).
    const shape = (a: FrameAccumulator): string => {
      const s = a.snapshot();
      return JSON.stringify({
        keys: Object.keys(s).sort(),
        slots: a.retainedSlotCount(),
        meanKeys: Object.keys(s.meanVector ?? {}).sort(),
      });
    };
    expect(shape(big)).toBe(shape(small));
    // eslint-disable-next-line no-console
    console.log(
      `O(1): 10-frame and 10,000-frame accumulators have identical retained shape ${shape(small)} — 1,000× the frames, same 7 slots.`,
    );
  });

  it('⛔ model_version change mid-session RESETS and records it; the trigger frame becomes frame 1 of the new version', () => {
    const acc = new FrameAccumulator(0);
    acc.addFrame(V({ happy: 0.9, neutral: 0.1 }), 'fer/1.0.0', 1);
    acc.addFrame(V({ happy: 0.8, neutral: 0.2 }), 'fer/1.0.0', 2);
    expect(acc.count).toBe(2);
    const r = acc.addFrame(V({ sad: 0.6, neutral: 0.4 }), 'fer/2.0.0', 3);
    expect(r.reset).toBe(true);
    expect(acc.resetCount).toBe(1);
    expect(acc.count).toBe(1);
    expect(acc.modelVersion).toBe('fer/2.0.0');
    expect(acc.mean()).toEqual(V({ sad: 0.6, neutral: 0.4 }));
  });

  it('⛔ a malformed vector THROWS — it is never added as zeros / uniform / neutral (TRAP 3)', () => {
    const acc = new FrameAccumulator(0);
    expect(() => acc.addFrame({ happy: 0.5 } as Record<string, number>, 'v', 1)).toThrow(TypeError);
    expect(acc.count).toBe(0);
    expect(acc.mean()).toBeNull();
  });

  it('zero frames → mean is null (zero-frame case handled upstream as text-only)', () => {
    expect(new FrameAccumulator(0).mean()).toBeNull();
  });
});
