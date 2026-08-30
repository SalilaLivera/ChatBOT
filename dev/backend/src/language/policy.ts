/**
 * C5 — routing policy for a detect.ts classification. Decides whether the
 * ORIGINAL, untouched message (TRAP 1) proceeds to the sentiment service or
 * is dropped in favour of face-only (BACKEND_IMPLEMENTATION_PLAN.md §5.5,
 * §5.5.1; C5_PLAN.md §4).
 *
 * ⛔ Non-Sinhala never reaches the sentiment service (§4.1) — this function
 * is called BEFORE any sentiment client call exists in the caller, and a
 * `face_only` / rejected / errored outcome here means the sentiment client
 * is never invoked at all.
 *
 * ⛔ Fusion is never bypassed on the face-only branch (§4.2/TRAP 2). This
 * module has no opinion on fusion — it only decides whether TEXT evidence
 * is built. The caller still calls the C4 fusion client with
 * `textEvidence: null`; that passthrough is the caller's responsibility
 * (proved directly in tests per C5_PLAN.md §7, since /mood/analyse is C6).
 *
 * The `mixed` band's routing is the SIGNED SAFE DEFAULT (owner, 2026-08-30 —
 * see LANGUAGE_BOUNDS_PROPOSAL.md), pending the ML track's ratio-sweep
 * diagnostic: it is routed exactly like 'other' (no text evidence, no LLM,
 * no network call). This is a deliberate, temporary choice, not a permanent
 * one, and `mixed` is never silently upgraded to 'si'.
 */
import type { LanguageClassification } from './detect.js';

export type LanguagePolicy = 'face_only' | 'reject' | 'translate' | 'singlish_llm';

export type LanguageRouteDecision =
  | { route: 'sentiment'; languageDetected: 'si' }
  | { route: 'face_only'; languageDetected: LanguageClassification; textEvidenceDropped: true }
  | { route: 'reject'; languageDetected: LanguageClassification; textEvidenceDropped: true };

/**
 * `translate` and `singlish_llm` are explicit off switches with NO
 * implementation behind them (§5.6.9, §6 prohibition 4). Selecting either
 * must error clearly rather than silently doing nothing.
 */
export class LanguagePolicyNotImplementedError extends Error {
  constructor(public readonly policy: LanguagePolicy) {
    super(
      `LANGUAGE_POLICY=${policy} is an explicit off switch with no implementation behind it ` +
        `(Singlish/translation is deferred — BACKEND_IMPLEMENTATION_PLAN.md §5.6). Selecting it ` +
        `must fail loudly, not silently do nothing.`,
    );
    this.name = 'LanguagePolicyNotImplementedError';
  }
}

/**
 * Route a classification per `policy`. Never called for classification
 * 'si' from the caller's happy path in a way that skips the sentiment
 * service — 'si' always routes to 'sentiment' regardless of policy, since
 * LANGUAGE_POLICY governs what happens when Sinhala evidence is ABSENT,
 * not whether valid Sinhala text is used.
 */
export function routeLanguage(
  classification: LanguageClassification,
  policy: LanguagePolicy,
): LanguageRouteDecision {
  if (classification === 'si') {
    return { route: 'sentiment', languageDetected: 'si' };
  }

  switch (policy) {
    case 'face_only':
      return { route: 'face_only', languageDetected: classification, textEvidenceDropped: true };
    case 'reject':
      return { route: 'reject', languageDetected: classification, textEvidenceDropped: true };
    case 'translate':
    case 'singlish_llm':
      throw new LanguagePolicyNotImplementedError(policy);
    default: {
      const exhaustive: never = policy;
      throw new Error(`unhandled LANGUAGE_POLICY: ${JSON.stringify(exhaustive)}`);
    }
  }
}
