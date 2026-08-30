/**
 * The LLM pipeline, composed.
 *
 * One entry point that runs the whole chain and NEVER throws at the caller:
 *
 *   build prompt  →  provider  →  parse  →  sanitise  →  outbound filter
 *                                                              ↓
 *                                                   content, or FALLBACK
 *
 * ⛔ IT TAKES MOOD AS AN ARGUMENT AND DOES NOT FETCH IT. That keeps this module
 * independent of C6 orchestration, which does not exist yet — C6 will call this
 * rather than this reaching into C6.
 *
 * ⛔ NO EXCEPTION ESCAPES. Every failure path resolves to app-owned fallback
 * copy (D-8). A user in distress must never see a provider error, a stack
 * trace, or a partial response. The caller gets a result object and decides how
 * to present it; it never has to catch.
 *
 * ⛔ NO USER TEXT, PROMPT, RAW OUTPUT, OR PROVIDER BODY IS LOGGED OR RETURNED
 * IN DIAGNOSTICS. `LlmOutcome.diagnostic` carries error CLASS and CATEGORY only
 * (plan §10, and the O-5 lesson: an upstream error envelope can echo the
 * request, and an LLM request contains the user's message).
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §9, §14 steps 1-5.
 */

import type {
  ContentSuggestionType,
  GeneratedSection,
  Language,
  LlmGeneratedContent,
  MoodState,
} from './contract.js';
import { LlmError, isRetryable } from './errors.js';
import { checkOutboundResponse, type OutboundViolation } from './outboundFilterPartial.js';
import { parseGeneratedContent, type RepairAction } from './parse.js';
import { PROMPT_VERSION, buildMessages } from './prompt.js';
import type { LlmProvider } from './provider.js';
import { sanitiseMessage, sanitiseSectionContent, sanitiseSectionTitle } from './sanitise.js';

/**
 * Why a fallback was used. Metrics and logs only — never shown to a user.
 *
 * Distinguishing these matters operationally: `provider_failure` is transient
 * and expected occasionally, while `outbound_blocked` means the model produced
 * something that violated SAFETY_POLICY §4.3 and is worth alerting on.
 */
export type FallbackReason =
  | 'provider_failure'
  | 'malformed_output'
  | 'outbound_blocked'
  | 'empty_after_sanitise';

export interface LlmOutcome {
  readonly ok: boolean;
  /** Present when ok. Sanitised and outbound-checked. */
  readonly content?: LlmGeneratedContent;
  /** Present when !ok — app-owned copy, never model-generated. */
  readonly fallbackText?: string;
  readonly fallbackReason?: FallbackReason;
  /**
   * Non-payload diagnostics. Safe to log.
   *
   * Deliberately has no field that could hold text: no `output`, no `prompt`,
   * no `body`. There is nowhere for a payload to hide.
   */
  readonly diagnostic: {
    readonly promptVersion: string;
    readonly provider: string;
    readonly model: string;
    readonly attempts: number;
    readonly elapsedMs?: number;
    readonly errorCode?: string;
    readonly repair?: RepairAction;
    readonly truncated?: boolean;
    readonly violations?: readonly OutboundViolation[];
    readonly sanitiserRemoved?: boolean;
  };
}

/**
 * App-owned fallback copy (D-8).
 *
 * ⚠️ THIS IS USER-FACING COPY IN A POSSIBLY-DISTRESSED CONTEXT. It is
 * deliberately plain: it does not apologise excessively, does not speculate,
 * and does not imply the user did anything wrong.
 *
 * ⛔ THE SINHALA STRINGS ARE PROVISIONAL AND NEED REVIEW (blocker B-4).
 * SAFETY_POLICY §4.2 says of its own trigger lists: "Do not populate ... by
 * machine translation from English." The same reasoning applies to reassurance
 * copy — a machine-translated "something went wrong" can land as dismissive.
 * These must be reviewed by a Sinhala speaker before any real user sees them.
 *
 * ⛔ NONE OF THIS IS ESCALATION WORDING. Safety templates are DRAFT PENDING
 * ETHICS REVIEW (SAFETY_POLICY §5) and no substitute is invented here.
 */
export const FALLBACK_TEXT: Readonly<Record<Language, string>> = {
  en: "I'm having trouble replying just now. Please try again in a moment — I'm still here.",
  si: 'මට දැන් පිළිතුරු දීමට අපහසුයි. මොහොතකින් නැවත උත්සාහ කරන්න — මම තවමත් මෙහි සිටිමි.',
};

export interface LlmServiceOptions {
  readonly provider: LlmProvider;
  readonly maxOutputTokens: number;
  /** D-4: 20_000. Supplied by config — never defaulted here. */
  readonly timeoutMs: number;
  readonly temperature?: number;
  /** Injectable so tests do not sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface GenerateInputs {
  readonly moodState: MoodState;
  readonly language: Language;
  readonly userText: string;
  /** Type enum only — never a ContentSuggestion. See prompt.ts. */
  readonly contentType?: ContentSuggestionType | null;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sanitise every field of parsed content.
 *
 * A section whose content sanitises to nothing is DROPPED — rendering an empty
 * heading is worse than omitting the section. If the message itself sanitises
 * away, the caller falls back, because there is nothing left to show.
 */
function sanitiseContent(content: LlmGeneratedContent): {
  sanitised: LlmGeneratedContent | null;
  removedAnything: boolean;
} {
  const messageResult = sanitiseMessage(content.message);
  let removedAnything = messageResult.modified;

  if (messageResult.text.trim().length === 0) {
    return { sanitised: null, removedAnything: true };
  }

  const sections: GeneratedSection[] = [];
  for (const section of content.sections ?? []) {
    const title = sanitiseSectionTitle(section.title);
    const body = sanitiseSectionContent(section.content);
    removedAnything = removedAnything || title.modified || body.modified;
    if (title.text.trim().length === 0 || body.text.trim().length === 0) {
      removedAnything = true;
      continue;
    }
    sections.push({ title: title.text, content: body.text });
  }

  const sanitised: LlmGeneratedContent =
    sections.length > 0 ? { message: messageResult.text, sections } : { message: messageResult.text };

  return { sanitised, removedAnything };
}

export class LlmService {
  private readonly options: LlmServiceOptions;

  constructor(options: LlmServiceOptions) {
    this.options = options;
  }

  /** Never throws. Every failure resolves to a fallback outcome. */
  async generate(inputs: GenerateInputs): Promise<LlmOutcome> {
    const { provider, maxOutputTokens, timeoutMs, temperature } = this.options;
    const sleep = this.options.sleep ?? defaultSleep;

    const base = { promptVersion: PROMPT_VERSION, provider: provider.name, model: provider.model };
    const messages = buildMessages(inputs);

    // ---- provider call, with ONE retry on transient failures only ----------
    // Plan §9.2: malformed output is NOT retried — a model that produced bad
    // JSON will likely do it again, and retrying doubles latency while the user
    // waits. Only transport and quota failures get a second attempt.
    let attempts = 0;
    let raw: Awaited<ReturnType<LlmProvider['complete']>> | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      attempts += 1;
      try {
        // `temperature` is spread in only when set: the project runs with
        // exactOptionalPropertyTypes, and passing an explicit `undefined` is
        // not the same as omitting the key. It also keeps the promise made in
        // provider.ts — no default temperature is invented here.
        raw = await provider.complete({
          messages,
          maxOutputTokens,
          timeoutMs,
          ...(temperature === undefined ? {} : { temperature }),
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 0 && isRetryable(err)) {
          // Small jittered backoff. Bounded so it cannot eat the timeout budget.
          await sleep(120 + Math.floor(Math.random() * 180));
          continue;
        }
        break;
      }
    }

    if (raw === null) {
      return {
        ok: false,
        fallbackText: FALLBACK_TEXT[inputs.language],
        fallbackReason: 'provider_failure',
        diagnostic: {
          ...base,
          attempts,
          errorCode: lastError instanceof LlmError ? lastError.code : 'unknown_error',
        },
      };
    }

    // ---- parse -------------------------------------------------------------
    let parsed;
    try {
      parsed = parseGeneratedContent(raw.text);
    } catch (err) {
      return {
        ok: false,
        fallbackText: FALLBACK_TEXT[inputs.language],
        fallbackReason: 'malformed_output',
        diagnostic: {
          ...base,
          attempts,
          elapsedMs: raw.elapsedMs,
          errorCode: err instanceof LlmError ? err.code : 'unknown_error',
        },
      };
    }

    // ---- sanitise ----------------------------------------------------------
    const { sanitised, removedAnything } = sanitiseContent(parsed.content);
    if (sanitised === null) {
      return {
        ok: false,
        fallbackText: FALLBACK_TEXT[inputs.language],
        fallbackReason: 'empty_after_sanitise',
        diagnostic: { ...base, attempts, elapsedMs: raw.elapsedMs, sanitiserRemoved: true },
      };
    }

    // ---- outbound constraint layer (PARTIAL — see outboundFilterPartial) ---
    // Runs AFTER sanitisation, on exactly the text that would be sent. §4.3:
    // on violation, replace or block — never silently pass through.
    const outbound = checkOutboundResponse(sanitised);
    if (!outbound.allowed) {
      return {
        ok: false,
        fallbackText: FALLBACK_TEXT[inputs.language],
        fallbackReason: 'outbound_blocked',
        diagnostic: {
          ...base,
          attempts,
          elapsedMs: raw.elapsedMs,
          violations: outbound.violations,
          sanitiserRemoved: removedAnything,
        },
      };
    }

    return {
      ok: true,
      content: sanitised,
      diagnostic: {
        ...base,
        attempts,
        elapsedMs: raw.elapsedMs,
        repair: parsed.repair,
        truncated: parsed.truncated,
        sanitiserRemoved: removedAnything,
      },
    };
  }
}
