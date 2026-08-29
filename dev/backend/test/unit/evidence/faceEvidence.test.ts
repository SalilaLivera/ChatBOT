import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFaceEvidence, FER_TO_STATE, UnknownFerClassError } from '../../../src/evidence/faceEvidence.js';
import { SUBSTANTIVE_STATES } from '../../../src/evidence/states.js';

const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

interface FerPredictFixture {
  model_version: string;
  probabilities: Record<string, number>;
  predicted_class: string;
  confidence: number;
}

function loadValidFerFixtures(): FerPredictFixture[] {
  // The 19 valid fixtures: fer_face_*, fer_noise_*, fer_flat_*, fer_gradient_*.
  // Excludes fer_edge_* (error envelopes, not /predict success bodies).
  return readdirSync(FIXTURES_DIR)
    .filter((f) => /^fer_(face|noise|flat|gradient)_.*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf8')) as FerPredictFixture);
}

describe('T-A1 — the §9b worked example reproduces exactly', () => {
  it('angry .20, disgust .05, fear .15, happy .25, neutral .20, sad .10, surprise .05', () => {
    const result = buildFaceEvidence({
      probabilities: {
        angry: 0.2,
        disgust: 0.05,
        fear: 0.15,
        happy: 0.25,
        neutral: 0.2,
        sad: 0.1,
        surprise: 0.05,
      },
      predictedClass: 'happy',
      confidence: 0.25,
      modelVersion: 'fer-mobilenetv2-96-float32/1.0.0',
    });

    expect(result).toEqual({
      scores: { calm: 0.25, neutral: 0.25, distressed: 0.5 },
      predicted_state: 'calm',
      confidence: 0.25,
      model_version: 'fer-mobilenetv2-96-float32/1.0.0',
    });
  });
});

describe('T-A2 — predicted_state MAY differ from argmax(scores) for face (mirrors F14)', () => {
  it('the worked example: predicted_state="calm" while argmax(scores) is "distressed"', () => {
    const result = buildFaceEvidence({
      probabilities: {
        angry: 0.2,
        disgust: 0.05,
        fear: 0.15,
        happy: 0.25,
        neutral: 0.2,
        sad: 0.1,
        surprise: 0.05,
      },
      predictedClass: 'happy',
      confidence: 0.25,
      modelVersion: 'fer-mobilenetv2-96-float32/1.0.0',
    });
    const argmaxOfScores = (Object.entries(result.scores) as [string, number][]).sort(
      (a, b) => b[1] - a[1],
    )[0]![0];
    expect(argmaxOfScores).toBe('distressed');
    expect(result.predicted_state).toBe('calm');
    expect(result.predicted_state).not.toBe(argmaxOfScores);
  });
});

describe('T-A3 — emitted key set is exactly the four §A4 keys', () => {
  it('face evidence has exactly scores, predicted_state, confidence, model_version', () => {
    const result = buildFaceEvidence({
      probabilities: { angry: 0, disgust: 0, fear: 0, happy: 1, neutral: 0, sad: 0, surprise: 0 },
      predictedClass: 'happy',
      confidence: 1,
      modelVersion: 'v',
    });
    expect(Object.keys(result).sort()).toEqual(
      ['confidence', 'model_version', 'predicted_state', 'scores'].sort(),
    );
  });
});

describe('T-A4 — scores key order is calm, neutral, distressed', () => {
  it('Object.keys(scores) is exactly [calm, neutral, distressed] in that order', () => {
    const result = buildFaceEvidence({
      probabilities: { angry: 0, disgust: 0, fear: 0, happy: 1, neutral: 0, sad: 0, surprise: 0 },
      predictedClass: 'happy',
      confidence: 1,
      modelVersion: 'v',
    });
    expect(Object.keys(result.scores)).toEqual([...SUBSTANTIVE_STATES]);
  });
});

describe('T-A5 — renormalised scores sum to 1.0 within 1e-9', () => {
  it('>=10,000 randomised 6dp vectors', () => {
    const classes = Object.keys(FER_TO_STATE);
    let checked = 0;
    for (let i = 0; i < 10_000; i++) {
      const probabilities: Record<string, number> = {};
      for (const c of classes) {
        probabilities[c] = Math.round(Math.random() * 1_000_000) / 1_000_000;
      }
      // Avoid the degenerate all-zero vector (division by zero) — FER never
      // emits one (its output is a softmax), so it is out of scope here.
      const total = Object.values(probabilities).reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      const predictedClass = classes[Math.floor(Math.random() * classes.length)]!;
      const result = buildFaceEvidence({
        probabilities,
        predictedClass,
        confidence: probabilities[predictedClass]!,
        modelVersion: 'v',
      });
      const sum = result.scores.calm + result.scores.neutral + result.scores.distressed;
      expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(9_900);
  });

  it('all 19 real FER fixtures — the real bar', () => {
    const fixtures = loadValidFerFixtures();
    expect(fixtures.length).toBe(19);

    let maxDeviation = 0;
    for (const fixture of fixtures) {
      const result = buildFaceEvidence({
        probabilities: fixture.probabilities,
        predictedClass: fixture.predicted_class,
        confidence: fixture.confidence,
        modelVersion: fixture.model_version,
      });
      const sum = result.scores.calm + result.scores.neutral + result.scores.distressed;
      const deviation = Math.abs(sum - 1.0);
      maxDeviation = Math.max(maxDeviation, deviation);
      expect(deviation).toBeLessThanOrEqual(1e-9);
    }
    // eslint-disable-next-line no-console
    console.log(`T-A5: max |Σ scores - 1.0| across 19 real fixtures AFTER renormalisation = ${maxDeviation}`);
  });
});

describe('T-A6 / T-A7 — all seven FER classes map correctly; an unknown class raises', () => {
  it('T-A6: each of the seven classes maps to its documented state', () => {
    const expected: Record<string, string> = {
      happy: 'calm',
      neutral: 'neutral',
      surprise: 'neutral',
      angry: 'distressed',
      disgust: 'distressed',
      fear: 'distressed',
      sad: 'distressed',
    };
    for (const [ferClass, state] of Object.entries(expected)) {
      const probabilities = { angry: 0, disgust: 0, fear: 0, happy: 0, neutral: 0, sad: 0, surprise: 0 };
      probabilities[ferClass as keyof typeof probabilities] = 1;
      const result = buildFaceEvidence({
        probabilities,
        predictedClass: ferClass,
        confidence: 1,
        modelVersion: 'v',
      });
      expect(result.predicted_state).toBe(state);
    }
  });

  it('T-A7: an eighth, unrecognised predicted_class raises UnknownFerClassError', () => {
    expect(() =>
      buildFaceEvidence({
        probabilities: { angry: 0, disgust: 0, fear: 0, happy: 0, neutral: 0, sad: 0, surprise: 0 },
        predictedClass: 'contempt',
        confidence: 1,
        modelVersion: 'v',
      }),
    ).toThrow(UnknownFerClassError);
  });

  it('an unrecognised predicted_class is NEVER silently mapped to neutral', () => {
    let caught: unknown = null;
    try {
      buildFaceEvidence({
        probabilities: { angry: 0, disgust: 0, fear: 0, happy: 0, neutral: 0, sad: 0, surprise: 0 },
        predictedClass: 'bored',
        confidence: 1,
        modelVersion: 'v',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownFerClassError);
  });
});
