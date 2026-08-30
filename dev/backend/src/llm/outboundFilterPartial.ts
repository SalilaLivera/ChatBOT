/**
 * PARTIAL outbound constraint layer.
 *
 * ⛔ THE NAME IS DELIBERATE AND MUST NOT BE SHORTENED.
 *
 * SAFETY_POLICY §4.3 specifies an outbound constraint layer applied to every
 * generated response before it reaches the user. This module implements ONLY
 * THE MECHANICALLY CHECKABLE PART OF IT. Calling it "the outbound constraint
 * layer" would let a partial filter be mistaken for the specified one, and a
 * later reader would believe §4.3 is satisfied when it is not.
 *
 * COVERAGE — honest accounting (plan §13, B-3):
 *
 *   ✅ exposing system prompts / internal mood values      structural checks
 *   ✅ dosage instructions                                  structural patterns
 *   ⚠️ presenting as a clinician                            phrase patterns, partial
 *   ⛔ MEDICATION NAMES                                     INACTIVE — needs an
 *        authored lexicon. Not invented here: SAFETY_POLICY §4.2 requires
 *        bilingual clinical and linguistic review for exactly this class of
 *        asset, and explicitly forbids machine translation.
 *   ⛔ ASSERTING OR IMPLYING A CLINICAL DIAGNOSIS           NOT CHECKABLE
 *   ⛔ CLAIMING AN EXPRESSION PROVES A STATE                NOT CHECKABLE
 *
 * The last two are the same hard problem as M8 and cannot be closed by pattern
 * matching. They remain uncovered, and `coverage()` reports them as uncovered
 * so the gap is visible at runtime rather than only in this comment.
 *
 * ON VIOLATION: replace or block — NEVER silently pass through (§4.3).
 *
 * ⛔ NO OFFENDING TEXT LEAVES THIS MODULE. Violations carry a CATEGORY only.
 * The text is model output derived from the user's message, and putting it in a
 * result puts it in a log (plan §10; the O-5 lesson generalised).
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §7.3, §13 B-3.
 */

/** Categories this module can actually detect. */
export type OutboundViolation =
  | 'dosage_instruction'
  | 'clinician_self_presentation'
  | 'internal_disclosure'
  | 'medication_name';

export interface OutboundCheckResult {
  readonly allowed: boolean;
  /** Categories only. Never the offending text. */
  readonly violations: readonly OutboundViolation[];
}

/**
 * Prohibitions this module does NOT cover, exposed at runtime.
 *
 * Surfaced through `/health` so an operator sees the gap without reading source.
 */
export interface OutboundCoverage {
  readonly covered: readonly OutboundViolation[];
  readonly uncovered: readonly string[];
  /** True only when every §4.3 prohibition is enforced. Never true today. */
  readonly isComplete: boolean;
}

/**
 * Medication-name lexicon.
 *
 * ⛔ INTENTIONALLY EMPTY. Populating it is authoring a clinical asset, which
 * SAFETY_POLICY §4.2 assigns to bilingual clinical and linguistic review — the
 * same document that says "Do not populate trigger lists by machine translation
 * from English."
 *
 * Inventing plausible drug names here would produce a filter that looks
 * complete and misses exactly the terms a Sinhala speaker would use.
 */
const MEDICATION_LEXICON: readonly string[] = [];

/**
 * Dosage instructions — STRUCTURAL, so checkable without a drug lexicon.
 *
 * This is the useful insight: a dosage instruction is prohibited regardless of
 * which drug it names, so the pattern catches "take two tablets twice a day"
 * without knowing what the tablet is. It therefore covers a real slice of §4.3
 * that would otherwise wait on clinical review.
 */
const DOSAGE_PATTERNS: readonly RegExp[] = [
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml|g|iu)\b/i,
  /\btake\s+(?:\d+|one|two|three|four|a|another)\b[^.\n]{0,40}\b(?:tablet|pill|capsule|dose|spoon|drop)/i,
  /\b(?:once|twice|three times|four times)\s+(?:a|per|each)\s+(?:day|night|week)\b/i,
  /\b(?:increase|decrease|double|halve|stop taking|start taking)\s+(?:your|the)\s+(?:dose|dosage|medication|tablets)\b/i,
];

/** Clinician self-presentation. Partial by nature — phrasing is unbounded. */
const CLINICIAN_PATTERNS: readonly RegExp[] = [
  /\bas\s+your\s+(?:doctor|physician|midwife|nurse|clinician)\b/i,
  /\bi\s+am\s+(?:a|your)\s+(?:doctor|physician|midwife|nurse|clinician)\b/i,
  /\bi\s+(?:diagnose|am diagnosing|can diagnose)\b/i,
  /\b(?:my|this)\s+(?:medical|clinical)\s+(?:opinion|advice|assessment)\b/i,
  /\bi\s+(?:prescribe|am prescribing)\b/i,
];

/**
 * Internal disclosure — system prompt fragments, or internal mood values.
 *
 * The numeric checks matter more than they look. §3.2 withholds probabilities,
 * confidence and weights from the prompt precisely so the model cannot narrate
 * them — this is the backstop for that, catching a leak from any other route.
 */
const INTERNAL_DISCLOSURE_PATTERNS: readonly RegExp[] = [
  /\b(?:system\s+prompt|my\s+instructions|i\s+was\s+instructed|my\s+system\s+message)\b/i,
  // A mood state adjacent to a number — "distressed (0.82)", "calm: 0.7".
  /\b(?:calm|neutral|distressed|unknown)\b\s*[:(=]\s*\d?\.\d+/i,
  /\b(?:confidence|probability|score)\s*(?:is|of|:|=)\s*\d?\.\d+/i,
  /\b(?:w_face|w_text|tau_[a-z_]+|fusion\s+weight)\b/i,
  /\b(?:fer|sinbert|mobilenet)\b/i,
  /\bmodalities_used\b/i,
  // "your camera shows", "from your face I can see" — the user must never be
  // told a camera reading drove the tone (§3.2).
  /\b(?:your\s+(?:camera|webcam|face)\s+(?:shows|tells|indicates|suggests))\b/i,
];

function anyMatch(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Check one piece of generated text.
 *
 * Runs over `message` and every section's title and content — a violation in a
 * section is exactly as serious as one in the message, and a section titled
 * "When to seek help" does not license its content.
 */
export function checkOutbound(text: string): OutboundCheckResult {
  const violations: OutboundViolation[] = [];

  if (anyMatch(DOSAGE_PATTERNS, text)) violations.push('dosage_instruction');
  if (anyMatch(CLINICIAN_PATTERNS, text)) violations.push('clinician_self_presentation');
  if (anyMatch(INTERNAL_DISCLOSURE_PATTERNS, text)) violations.push('internal_disclosure');

  if (MEDICATION_LEXICON.length > 0) {
    const lower = text.toLowerCase();
    if (MEDICATION_LEXICON.some((name) => lower.includes(name.toLowerCase()))) {
      violations.push('medication_name');
    }
  }

  return { allowed: violations.length === 0, violations };
}

/**
 * Check a whole assembled response.
 *
 * Fails on the FIRST violating field but reports every category found, so a log
 * shows what was wrong without ever showing what was said.
 */
export function checkOutboundResponse(parts: {
  readonly message: string;
  readonly sections?: readonly { readonly title: string; readonly content: string }[];
}): OutboundCheckResult {
  const found = new Set<OutboundViolation>();

  for (const v of checkOutbound(parts.message).violations) found.add(v);
  for (const section of parts.sections ?? []) {
    for (const v of checkOutbound(section.title).violations) found.add(v);
    for (const v of checkOutbound(section.content).violations) found.add(v);
  }

  return { allowed: found.size === 0, violations: [...found] };
}

/**
 * What this module does and does not enforce. For `/health`.
 *
 * `isComplete` is hardcoded false and MUST NOT be flipped to true until every
 * uncovered row below is genuinely enforced. It is the runtime statement that
 * SAFETY_POLICY §4.3 is not yet satisfied.
 */
export function coverage(): OutboundCoverage {
  const covered: OutboundViolation[] = [
    'dosage_instruction',
    'clinician_self_presentation',
    'internal_disclosure',
  ];
  if (MEDICATION_LEXICON.length > 0) covered.push('medication_name');

  const uncovered = [
    'asserting_or_implying_clinical_diagnosis',
    'claiming_an_expression_proves_a_state',
    ...(MEDICATION_LEXICON.length === 0
      ? ['medication_names_lexicon_not_authored']
      : []),
  ];

  return { covered, uncovered, isComplete: false };
}
