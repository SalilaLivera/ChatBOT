/**
 * C5 — the detector. Bounds used here are the .env.example PLACEHOLDER set
 * (LANGUAGE_SI_RATIO_HIGH=0.6, LANGUAGE_SI_RATIO_LOW=0.1), visibly marked as
 * unsigned in LANGUAGE_BOUNDS_PROPOSAL.md. These tests exercise BEHAVIOUR AT
 * A BOUND, not bless a particular number (C5_PROMPT.md THE GATE).
 */
import { describe, expect, it } from 'vitest';
import { detectLanguage, SINHALA_LANGUAGE_CODE, type LanguageBounds } from '../../../src/language/detect.js';

const BOUNDS: LanguageBounds = { siRatioHigh: 0.6, siRatioLow: 0.1 };

describe('detectLanguage — §8.2 trap', () => {
  it('English is classified non-Sinhala with ratio EXACTLY 0.0', () => {
    const result = detectLanguage('I feel anxious about the appointment today.', BOUNDS);
    expect(result.ratio).toBe(0);
    expect(result.classification).not.toBe('si');
  });

  it('romanised Sinhala (Singlish) is non-Sinhala — deferred, not detected (§6)', () => {
    // Owner decision 2026-08-30: Singlish development is parked. Latin-script
    // "mama gedara yanawa" ("I am going home") is indistinguishable from
    // English to a script test and MUST route non-Sinhala. When Singlish
    // detection is picked up, THIS test is the one that changes.
    const result = detectLanguage('mama gedara yanawa', BOUNDS);
    expect(result.classification).not.toBe('si');
    expect(result.ratio).toBe(0);
  });

  it('native Sinhala Unicode is classified si with ratio 1.0', () => {
    const result = detectLanguage('මට අද හරිම බයයි.', BOUNDS);
    expect(result.classification).toBe('si');
    expect(result.ratio).toBe(1);
  });

  it('emits a code that is a member of the live fusion SINHALA_LANGUAGE_CODES contract', async () => {
    const res = await fetch(`${process.env.FUSION_SERVICE_URL ?? 'http://localhost:9000'}/contract`);
    const contract = (await res.json()) as { sinhala_language_codes: string[] };
    expect(contract.sinhala_language_codes.map((c) => c.toLowerCase())).toContain(SINHALA_LANGUAGE_CODE);
  });
});

describe('detectLanguage — degenerate zero-letter input (§3.2 / D-26)', () => {
  it('empty string does not divide by zero and is classified non-Sinhala', () => {
    const result = detectLanguage('', BOUNDS);
    expect(result.letterCount).toBe(0);
    expect(result.ratio).toBe(0);
    expect(Number.isNaN(result.ratio)).toBe(false);
    expect(result.classification).toBe('other');
  });

  it('emoji-only input does not divide by zero', () => {
    const result = detectLanguage('😊👍🎉', BOUNDS);
    expect(result.letterCount).toBe(0);
    expect(Number.isNaN(result.ratio)).toBe(false);
    expect(result.classification).toBe('other');
  });

  it('digits/punctuation-only input does not divide by zero', () => {
    const result = detectLanguage('12:34 !!! ---', BOUNDS);
    expect(result.letterCount).toBe(0);
    expect(Number.isNaN(result.ratio)).toBe(false);
    expect(result.classification).toBe('other');
  });
});

describe('detectLanguage — behaviour AT the bounds, not a particular blessed number', () => {
  it('a ratio exactly at siRatioHigh classifies si', () => {
    // 3 Sinhala letters (අකග) + 2 Latin letters (bc) = ratio exactly 0.6.
    const result = detectLanguage('අකග bc', BOUNDS);
    expect(result.ratio).toBeCloseTo(0.6, 10);
    expect(result.classification).toBe('si');
  });

  it('a ratio just below siRatioHigh classifies mixed, not si', () => {
    const result = detectLanguage('අකග bcd', BOUNDS); // 3 sinhala / 6 letters = 0.5
    expect(result.ratio).toBeLessThan(BOUNDS.siRatioHigh);
    expect(result.ratio).toBeGreaterThan(BOUNDS.siRatioLow);
    expect(result.classification).toBe('mixed');
  });

  it('a ratio exactly at siRatioLow classifies other', () => {
    // 1 Sinhala letter in 10 total = ratio exactly 0.1.
    const result = detectLanguage('අ bcdefghij', BOUNDS);
    expect(result.ratio).toBeCloseTo(0.1, 10);
    expect(result.classification).toBe('other');
  });

  it('a ratio just above siRatioLow classifies mixed, not other', () => {
    const result = detectLanguage('අ bcdefghi', BOUNDS); // 1/9 ≈ 0.111
    expect(result.ratio).toBeGreaterThan(BOUNDS.siRatioLow);
    expect(result.classification).toBe('mixed');
  });
});

describe('⛔ TRAP 1 — the detector returns no string; input text is unaffected', () => {
  it('detectLanguage takes a string and returns a classification object, never a transformed string', () => {
    const input = ' Some MIXED text 123 !! ';
    const before = input;
    const result = detectLanguage(input, BOUNDS);
    // the input binding itself is never mutated (strings are immutable in JS,
    // but this asserts no accidental reassignment/side channel exists) and
    // the function's return type carries no string field at all.
    expect(input).toBe(before);
    expect('text' in result).toBe(false);
    expect('normalised' in result).toBe(false);
    expect(typeof result).toBe('object');
  });
});
