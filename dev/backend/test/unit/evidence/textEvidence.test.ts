import { describe, expect, it } from 'vitest';
import { buildTextEvidence, TextArgmaxDivergenceError } from '../../../src/evidence/textEvidence.js';
import { argmaxState } from '../../../src/evidence/states.js';

describe('T-A8 — text evidence IS rejected on predicted_state / argmax(scores) divergence (mirrors F15)', () => {
  it('a straightforwardly wrong predicted_label raises TextArgmaxDivergenceError', () => {
    expect(() =>
      buildTextEvidence({
        evidence: { calm: 0.1, neutral: 0.2, distressed: 0.7 },
        predictedLabel: 'CALM', // argmax is actually distressed
        confidence: 0.7,
        modelVersion: 'v',
        language: 'si',
      }),
    ).toThrow(TextArgmaxDivergenceError);
  });

  it('a matching predicted_label does NOT raise', () => {
    const result = buildTextEvidence({
      evidence: { calm: 0.1, neutral: 0.2, distressed: 0.7 },
      predictedLabel: 'DISTRESSED',
      confidence: 0.7,
      modelVersion: 'v',
      language: 'si',
    });
    expect(result.predicted_state).toBe('distressed');
  });

  it('TRAP 2 — an exact tie is broken by the FIRST maximum in calm, neutral, distressed order, matching fusion argmax_state()', () => {
    // calm and neutral are exactly tied; fusion's argmax_state() (and this
    // adapter's local argmaxState()) must both pick "calm" — the first
    // maximum, matching numpy argmax. A "last max wins" implementation would
    // pick "neutral" here and disagree with fusion.
    const scores = { calm: 0.4, neutral: 0.4, distressed: 0.2 };
    expect(argmaxState(scores)).toBe('calm');

    const accepted = buildTextEvidence({
      evidence: scores,
      predictedLabel: 'CALM',
      confidence: 0.4,
      modelVersion: 'v',
      language: 'si',
    });
    expect(accepted.predicted_state).toBe('calm');

    // The service reporting "neutral" on the same exact tie must be rejected
    // — it disagrees with the tie-break both this adapter and fusion use.
    expect(() =>
      buildTextEvidence({
        evidence: scores,
        predictedLabel: 'NEUTRAL',
        confidence: 0.4,
        modelVersion: 'v',
        language: 'si',
      }),
    ).toThrow(TextArgmaxDivergenceError);
  });

  it('a three-way exact tie is broken to "calm", the first state in order', () => {
    const scores = { calm: 1 / 3, neutral: 1 / 3, distressed: 1 / 3 };
    expect(argmaxState(scores)).toBe('calm');
  });
});

describe('text evidence carries five keys (four §A4 keys plus language)', () => {
  it('exactly scores, predicted_state, confidence, model_version, language', () => {
    const result = buildTextEvidence({
      evidence: { calm: 1, neutral: 0, distressed: 0 },
      predictedLabel: 'CALM',
      confidence: 1,
      modelVersion: 'v',
      language: 'si',
    });
    expect(Object.keys(result).sort()).toEqual(
      ['confidence', 'language', 'model_version', 'predicted_state', 'scores'].sort(),
    );
  });

  it('scores key order is calm, neutral, distressed', () => {
    const result = buildTextEvidence({
      evidence: { calm: 1, neutral: 0, distressed: 0 },
      predictedLabel: 'CALM',
      confidence: 1,
      modelVersion: 'v',
      language: 'si',
    });
    expect(Object.keys(result.scores)).toEqual(['calm', 'neutral', 'distressed']);
  });

  it('language is passed through verbatim — this adapter does not compute it (C5 does)', () => {
    const result = buildTextEvidence({
      evidence: { calm: 1, neutral: 0, distressed: 0 },
      predictedLabel: 'CALM',
      confidence: 1,
      modelVersion: 'v',
      language: 'en', // deliberately NOT Sinhala — proves this file makes no language judgement
    });
    expect(result.language).toBe('en');
  });

  it('no rounding is ever applied to scores — full float precision passes through', () => {
    const result = buildTextEvidence({
      evidence: { calm: 0.123456789012345, neutral: 0.333333333333333, distressed: 0.543209877654322 },
      predictedLabel: 'DISTRESSED',
      confidence: 0.543209877654322,
      modelVersion: 'v',
      language: 'si',
    });
    expect(result.scores.calm).toBe(0.123456789012345);
    expect(result.scores.neutral).toBe(0.333333333333333);
    expect(result.scores.distressed).toBe(0.543209877654322);
  });
});
