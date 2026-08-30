import { describe, expect, it } from 'vitest';
import { FrameAccumulator } from '../../../src/capture/frameAccumulator.js';
import { computeTurnFaceEvidence } from '../../../src/capture/turnFaceEvidence.js';
import { buildFaceEvidence } from '../../../src/evidence/faceEvidence.js';

const V = (o: Partial<Record<string, number>>): Record<string, number> => ({
  angry: 0, disgust: 0, fear: 0, happy: 0, neutral: 0, sad: 0, surprise: 0, ...o,
});

describe('computeTurnFaceEvidence — average FIRST, map SECOND; derive predictedClass (TRAP 2)', () => {
  it('zero valid frames → evidence null, frameCount 0 (text-only, 200 — normal operation)', () => {
    const acc = new FrameAccumulator(0);
    const turn = computeTurnFaceEvidence(acc.snapshot(), 5000);
    expect(turn.evidence).toBeNull();
    expect(turn.frameCount).toBe(0);
    expect(turn.sessionElapsedMs).toBe(5000);
  });

  it('one frame: evidence equals the adapter run on that exact vector, with a DERIVED predictedClass', () => {
    const acc = new FrameAccumulator(0);
    const v = V({ happy: 0.2, neutral: 0.2, angry: 0.2, disgust: 0.05, fear: 0.15, sad: 0.1, surprise: 0.05 });
    acc.addFrame(v, 'fer/1.0.0', 1);
    const turn = computeTurnFaceEvidence(acc.snapshot(), 10);
    // argmax of the mean (== v here) ties between happy/neutral/angry at 0.2;
    // FER service order is angry,disgust,fear,happy,... so first-max is "angry".
    const expected = buildFaceEvidence({
      probabilities: v,
      predictedClass: 'angry',
      confidence: 0.2,
      modelVersion: 'fer/1.0.0',
    });
    expect(turn.evidence).toEqual(expected);
  });

  it('averaging is over the 7-vector BEFORE the mapping: two frames whose individual argmaxes differ', () => {
    const acc = new FrameAccumulator(0);
    acc.addFrame(V({ happy: 0.9, sad: 0.1 }), 'v', 1); // frame argmax: happy → calm
    acc.addFrame(V({ sad: 0.8, happy: 0.2 }), 'v', 2); // frame argmax: sad → distressed
    // mean = happy .55, sad .45 → argmax(mean) = happy → predicted_state calm.
    // If per-frame labels were voted, it would be a 1–1 tie, not this.
    const turn = computeTurnFaceEvidence(acc.snapshot(), 10);
    expect(turn.evidence!.predicted_state).toBe('calm');
    expect(turn.evidence!.confidence).toBeCloseTo(0.55, 10);
  });

  it('tie-break follows FER service class order (first max wins), matching what the service would decide', () => {
    const acc = new FrameAccumulator(0);
    acc.addFrame(V({ fear: 0.5, surprise: 0.5 }), 'v', 1);
    // fear precedes surprise in the service order → predicted class fear → distressed
    const turn = computeTurnFaceEvidence(acc.snapshot(), 10);
    expect(turn.evidence!.predicted_state).toBe('distressed');
  });

  it('the mean still passes §3.3 renormalisation through the C3 adapter (scores sum to 1 within 1e-9)', () => {
    const acc = new FrameAccumulator(0);
    // realistic rounded vectors
    acc.addFrame(V({ angry: 0.196775, disgust: 0.006288, fear: 0.033282, happy: 0.361588, neutral: 0.198507, sad: 0.130089, surprise: 0.073471 }), 'v', 1);
    acc.addFrame(V({ angry: 0.033372, disgust: 0.015208, fear: 0.032807, happy: 0.699128, neutral: 0.090136, sad: 0.095258, surprise: 0.034091 }), 'v', 2);
    const s = computeTurnFaceEvidence(acc.snapshot(), 10).evidence!.scores;
    expect(Math.abs(s.calm + s.neutral + s.distressed - 1)).toBeLessThanOrEqual(1e-9);
  });
});
