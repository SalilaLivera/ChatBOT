/**
 * Typed LLM errors.
 *
 * Extends the project's `AppError` so LLM failures carry the same guarantee as
 * upstream ones: `detail` is internal, and `toEnvelope()` never includes it.
 *
 * ⛔ TWO RULES THAT MUST NOT BE RELAXED
 *
 * 1. NO PROVIDER DETAIL REACHES A USER. Provider names, model IDs, HTTP status
 *    codes and provider error text are for logs and `/health` only. The user
 *    sees app-authored fallback copy (D-8) in their UI language.
 *
 * 2. ⛔ NO PROVIDER ERROR BODY IS EVER CARRIED, LOGGED, OR STORED.
 *    O-5 (C2_DONE §5) found FastAPI's 422 envelope ECHOES THE REQUEST BODY.
 *    The same class of failure is WORSE here: an LLM request body contains the
 *    system prompt AND the user's message, so a provider error body is a
 *    pregnancy-domain personal-text leak. Adapters must discard the body at the
 *    boundary and construct these errors from a STATUS CODE and an ERROR CLASS
 *    only — never by passing the response through.
 *
 * `detail` on these errors is therefore restricted to non-payload facts
 * (status code, error class, elapsed ms). Never a body, never a prompt,
 * never model output.
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §9, §10.
 */

import { AppError } from '../errors/AppError.js';

/** Stable codes. Switch on these, never on a message. */
export const LLM_ERROR_CODES = [
  'llm_unavailable',
  'llm_timeout',
  'llm_rate_limited',
  'llm_malformed_output',
  'llm_output_blocked',
  'llm_config_error',
] as const;

export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];

/** Base for every LLM failure. */
export class LlmError extends AppError {
  constructor(code: LlmErrorCode, httpStatus: number, message: string, detail?: string) {
    super(code, httpStatus, message, detail);
    this.name = 'LlmError';
  }
}

/** Provider unreachable — DNS, connection refused, TLS, socket reset. */
export class LlmUnavailableError extends LlmError {
  constructor(detail?: string) {
    super('llm_unavailable', 503, 'The assistant is temporarily unavailable.', detail);
    this.name = 'LlmUnavailableError';
  }
}

/** Exceeded the configured timeout (D-4: 20 s). */
export class LlmTimeoutError extends LlmError {
  constructor(detail?: string) {
    super('llm_timeout', 504, 'The assistant took too long to respond.', detail);
    this.name = 'LlmTimeoutError';
  }
}

/**
 * Rate limited or out of quota (429, or a provider-specific quota signal).
 * Separated from `llm_unavailable` because the retry policy differs and
 * because a free-tier quota exhaustion is an operational fact worth seeing
 * distinctly in metrics.
 */
export class LlmRateLimitedError extends LlmError {
  constructor(detail?: string) {
    super('llm_rate_limited', 503, 'The assistant is busy right now.', detail);
    this.name = 'LlmRateLimitedError';
  }
}

/**
 * The model returned something that is not valid against the ChatResponse
 * schema, and one structural repair attempt also failed.
 *
 * ⛔ `detail` carries a SCHEMA ERROR ONLY — never the offending payload.
 * The payload is model output derived from the user's message.
 *
 * Plan §9.2: NO RETRY. A model that produced bad JSON will likely do it again;
 * retrying doubles latency and cost for a low chance of recovery.
 */
export class LlmMalformedOutputError extends LlmError {
  constructor(detail?: string) {
    super('llm_malformed_output', 502, 'The assistant could not produce a usable reply.', detail);
    this.name = 'LlmMalformedOutputError';
  }
}

/**
 * The outbound constraint layer rejected the generated response
 * (SAFETY_POLICY §4.3).
 *
 * ⛔ `detail` carries the VIOLATED CATEGORY ONLY — never the offending text.
 * §4.3: on violation, replace or block. Never silently pass through.
 */
export class LlmOutputBlockedError extends LlmError {
  constructor(detail?: string) {
    super('llm_output_blocked', 500, 'The assistant could not produce a usable reply.', detail);
    this.name = 'LlmOutputBlockedError';
  }
}

/**
 * Misconfiguration — absent API key, unset model ID, unknown provider name.
 *
 * Deliberately distinct from `llm_unavailable`: this is an operator fault that
 * a retry cannot fix, and it should be visible as such in `/health` and logs.
 */
export class LlmConfigError extends LlmError {
  constructor(detail?: string) {
    super('llm_config_error', 500, 'The assistant is not available.', detail);
    this.name = 'LlmConfigError';
  }
}

/**
 * Whether a failure is worth one retry (plan §9.2: one retry, with jitter).
 *
 * Transport and quota failures may be transient. Malformed output, blocked
 * output and configuration faults are not, and retrying them wastes a timeout
 * budget the user is waiting on.
 */
export function isRetryable(error: unknown): boolean {
  return (
    error instanceof LlmUnavailableError ||
    error instanceof LlmTimeoutError ||
    error instanceof LlmRateLimitedError
  );
}
