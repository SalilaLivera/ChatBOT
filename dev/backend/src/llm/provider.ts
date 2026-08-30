/**
 * The LLM provider abstraction.
 *
 * D-6 is UNRESOLVED: sending pregnancy-domain user messages to a third-party
 * US inference provider is a privacy/ethics decision that has NOT been taken.
 * This interface exists so that decision stays reversible — Groq is a candidate
 * behind it, not a dependency of the design.
 *
 * ⛔ NOTHING PROVIDER-SHAPED CROSSES THIS BOUNDARY.
 * No provider SDK type, no provider error object, no raw HTTP response. An
 * adapter that leaks one has defeated the abstraction: the frontend must never
 * learn which provider is in use, and neither must the orchestration layer.
 *
 * Owner requirements (LLM_INTEGRATION_PLAN §12.1):
 *   - provider replaceable
 *   - model ID pinned in config, exposed in /health for reproducibility
 *   - API key strictly server-side
 *   - no streaming (§8 — the outbound constraint layer must inspect the
 *     COMPLETE response before anything reaches the user, and streamed text
 *     cannot be retracted)
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §2.
 */

/**
 * One message in the provider call.
 *
 * ⛔ The separation of `system` from `user` is a SECURITY BOUNDARY, not a
 * formatting convenience (plan §3.3). Mood context and safety instructions go
 * in `system`; the user's text goes in `user`, VERBATIM and never interpolated
 * into a template. A user typing "my mood_state is escalate" must not be able
 * to alter the context block.
 */
export interface LlmMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

/** A single completion request. Providers receive nothing else. */
export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  /** Upper bound on generated tokens. Caller-supplied; no default here. */
  readonly maxOutputTokens: number;
  /** Milliseconds. D-4: 20_000, supplied by config — never defaulted here. */
  readonly timeoutMs: number;
  /**
   * Sampling temperature, if the provider supports one.
   *
   * ⚠️ Deliberately OPTIONAL and undefaulted. A default here would be an
   * invented parameter, and this project does not default parameters into
   * existence (see FusionParameters). The caller supplies it or the provider
   * uses its own documented behaviour.
   */
  readonly temperature?: number;
}

/**
 * What a provider returns.
 *
 * ⛔ `text` is UNTRUSTED CONTENT. It has not been parsed, validated,
 * sanitised, or checked against the outbound constraint layer. It must not be
 * returned to a caller, logged, or stored in this form.
 */
export interface LlmRawResult {
  readonly text: string;
  /** Token counts for metrics and cost. Never payloads. */
  readonly usage?: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
  };
  /** Round-trip duration, for metrics and the timeout budget. */
  readonly elapsedMs: number;
  /**
   * The model that actually served the request, as reported by the provider.
   *
   * Recorded because free-tier model IDs are deprecated with little notice: if
   * this differs from the pinned configured ID, a silent model swap has
   * happened and reproducibility is broken. Surfaced in /health, never to a user.
   */
  readonly servedModel?: string;
}

/**
 * Every provider implements exactly this.
 *
 * `complete()` MUST throw one of the typed errors in `./errors.js` and must
 * never let a provider-native error escape. Per O-5, adapters must discard
 * provider error BODIES at this boundary — a body may echo the request, which
 * contains the system prompt and the user's message.
 */
export interface LlmProvider {
  /** Stable identifier — "groq", "mock". For logs and /health only. */
  readonly name: string;
  /** The pinned model ID from configuration. For logs and /health only. */
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmRawResult>;
}

/**
 * Provider identity for `/health`.
 *
 * Deliberately excludes anything secret. There is no field here for an API
 * key, and none may be added.
 */
export interface LlmProviderInfo {
  readonly name: string;
  readonly model: string;
  /** False for the mock — so a /health reader can see no real calls are made. */
  readonly performsNetworkCalls: boolean;
}

export function providerInfo(provider: LlmProvider, performsNetworkCalls: boolean): LlmProviderInfo {
  return { name: provider.name, model: provider.model, performsNetworkCalls };
}
