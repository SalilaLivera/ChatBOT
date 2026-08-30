/**
 * C5 — language routing. A Unicode SCRIPT TEST, not statistical language
 * identification (BACKEND_IMPLEMENTATION_PLAN.md §5.2). Sinhala occupies a
 * dedicated block, U+0D80–U+0DFF, shared with no other living language.
 *
 * ⛔ TRAP 1 (C5_PROMPT.md): "normalise" describes how the RATIO is computed
 * ONLY. This module never returns a transformed string — it takes the
 * message and returns a classification. The original message is what
 * continues onward, byte-identical, to the sentiment client (standing rule
 * 6 — text_normalisation: "none").
 *
 * ⛔ THE GATE (§5.4 / C5_PLAN.md §2): the two ratio bounds are thresholds and
 * are NOT chosen here. They are read from configuration (config/env.ts),
 * proposed separately with a rationale and a labelled sample, and were
 * SIGNED by the owner 2026-08-30 — see LANGUAGE_BOUNDS_PROPOSAL.md.
 */

/** Sinhala's dedicated Unicode block (BACKEND_IMPLEMENTATION_PLAN.md §5.2). */
const SINHALA_BLOCK = /[඀-෿]/gu;

/**
 * "Letter characters" for the ratio denominator only: any Unicode letter
 * (\p{L}) union the Sinhala block (which also contains combining vowel
 * signs classified as marks, not letters, but which are unambiguously
 * Sinhala script and must count toward the total or native Sinhala text
 * would under-count its own denominator).
 */
const LETTER_OR_SINHALA = /[඀-෿]|\p{L}/gu;

/** The single language code this detector ever emits — a member of fusion's live SINHALA_LANGUAGE_CODES. */
export const SINHALA_LANGUAGE_CODE = 'si';

export type LanguageClassification = 'si' | 'mixed' | 'other';

export interface LanguageBounds {
  /** ratio >= this → 'si'. */
  siRatioHigh: number;
  /** ratio <= this → 'other'. Between the two bounds → 'mixed'. */
  siRatioLow: number;
}

export interface LanguageDetectionResult {
  classification: LanguageClassification;
  /** The computed Sinhala ratio. 0 for the degenerate zero-letter case (§3.2) — never NaN. */
  ratio: number;
  /** Total letter-ish characters found (the ratio denominator). 0 is the degenerate case. */
  letterCount: number;
}

/**
 * Classify `text`'s script. Returns no string — the caller's original
 * message is untouched (TRAP 1). Never divides by zero (§3.2 / D-26): a
 * message with zero letter characters (emoji only, digits only, punctuation
 * only) is defined as classification 'other' with ratio 0 — there is no
 * Sinhala evidence in the message, so claiming 'si' would be a lie.
 */
export function detectLanguage(text: string, bounds: LanguageBounds): LanguageDetectionResult {
  const letterMatches = text.match(LETTER_OR_SINHALA);
  const letterCount = letterMatches ? letterMatches.length : 0;

  if (letterCount === 0) {
    return { classification: 'other', ratio: 0, letterCount: 0 };
  }

  const sinhalaMatches = text.match(SINHALA_BLOCK);
  const sinhalaCount = sinhalaMatches ? sinhalaMatches.length : 0;
  const ratio = sinhalaCount / letterCount;

  let classification: LanguageClassification;
  if (ratio >= bounds.siRatioHigh) {
    classification = 'si';
  } else if (ratio <= bounds.siRatioLow) {
    classification = 'other';
  } else {
    classification = 'mixed';
  }

  return { classification, ratio, letterCount };
}
