/**
 * Deterministic mock provider. NO NETWORK.
 *
 * This exists so the entire LLM pipeline — parsing, schema validation, Markdown
 * sanitisation, the outbound constraint layer, error handling and the chat
 * route — is buildable and fully testable WITHOUT resolving D-6.
 *
 * That matters beyond convenience: D-6 (sending pregnancy-domain user messages
 * to a third-party US inference provider) is an unresolved privacy/ethics
 * decision. With this mock, D-6 blocks only the Groq adapter, not the schedule.
 *
 * ⛔ IT MAKES NO NETWORK CALL. `performsNetworkCalls` is false, and a test
 * asserts that. If this file ever imports an HTTP client, that is a defect.
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §2.1, §14 step 1.
 */

import {
  LlmMalformedOutputError,
  LlmRateLimitedError,
  LlmTimeoutError,
  LlmUnavailableError,
} from '../errors.js';
import type { LlmProvider, LlmRawResult, LlmRequest } from '../provider.js';

/**
 * Scripted behaviours, so failure paths are testable without provoking a real
 * provider into failing.
 *
 * `malformed` returns text that is NOT valid against the ChatResponse schema —
 * the case plan §9.2 says must NOT be retried.
 */
export type MockBehaviour =
  | { readonly kind: 'ok'; readonly text: string }
  | { readonly kind: 'malformed'; readonly text: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'rate_limited' };

export interface MockProviderOptions {
  /**
   * Behaviours consumed in order, one per call. When exhausted, the LAST one
   * repeats — so a single `ok` serves an unlimited number of calls, while a
   * scripted sequence can exercise retry logic.
   */
  readonly script?: readonly MockBehaviour[];
  readonly model?: string;
  /** Reported round-trip time. Fixed by default so tests stay deterministic. */
  readonly elapsedMs?: number;
}

/** A minimal valid ChatResponse body — `sections` deliberately ABSENT. */
export const MOCK_OK_TEXT = JSON.stringify({
  message: 'Thank you for telling me. I am here with you.',
});

/** A valid body WITH sections, for exercising the optional branch. */
export const MOCK_OK_WITH_SECTIONS_TEXT = JSON.stringify({
  message: 'That sounds uncomfortable, and it is common in the third trimester.',
  sections: [
    { title: 'What this may mean', content: 'Mild swelling is often normal.' },
    { title: 'What you can try', content: '- Rest with your feet raised\n- Drink water' },
  ],
});

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model: string;

  private readonly script: readonly MockBehaviour[];
  private readonly elapsedMs: number;
  private callIndex = 0;

  /** Number of calls received. For asserting retry counts and call ordering. */
  get callCount(): number {
    return this.callIndex;
  }

  /**
   * Requests received, in order.
   *
   * ⚠️ TEST-ONLY. Requests contain the system prompt and the user's message, so
   * this must never be logged, serialised, or reachable from production code.
   * It exists so tests can assert the §3.3 boundary — that mood context is in
   * the system message and the user's text is passed verbatim.
   */
  readonly receivedRequests: LlmRequest[] = [];

  constructor(options: MockProviderOptions = {}) {
    this.model = options.model ?? 'mock-model-v0';
    this.script = options.script ?? [{ kind: 'ok', text: MOCK_OK_TEXT }];
    this.elapsedMs = options.elapsedMs ?? 12;
    if (this.script.length === 0) {
      throw new Error('MockLlmProvider: script must not be empty');
    }
  }

  complete(request: LlmRequest): Promise<LlmRawResult> {
    this.receivedRequests.push(request);
    const behaviour = this.script[Math.min(this.callIndex, this.script.length - 1)]!;
    this.callIndex += 1;

    switch (behaviour.kind) {
      case 'ok':
      case 'malformed':
        return Promise.resolve({
          text: behaviour.text,
          elapsedMs: this.elapsedMs,
          servedModel: this.model,
          usage: { promptTokens: 0, completionTokens: 0 },
        });

      // Thrown, not simulated by waiting: a test must never actually sleep for
      // the 20 s timeout budget.
      case 'timeout':
        return Promise.reject(new LlmTimeoutError(`mock timeout after ${request.timeoutMs}ms`));

      case 'unavailable':
        return Promise.reject(new LlmUnavailableError('mock: provider unreachable'));

      case 'rate_limited':
        return Promise.reject(new LlmRateLimitedError('mock: status 429'));

      default: {
        const exhaustive: never = behaviour;
        return Promise.reject(
          new LlmMalformedOutputError(`unreachable mock behaviour: ${JSON.stringify(exhaustive)}`),
        );
      }
    }
  }
}
