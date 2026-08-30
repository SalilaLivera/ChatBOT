/**
 * Groq provider adapter.
 *
 * ⛔ NOT ENABLED. `LLM_PROVIDER` defaults to `mock`, and this adapter is only
 * constructed when that value is explicitly set to `groq` AND an API key is
 * present. D-6 — whether pregnancy-domain user messages may be sent to a
 * third-party US inference provider — is a PRIVACY AND ETHICS DECISION that
 * remains UNRESOLVED.
 *
 * The gate is deliberately a single configuration value rather than absent
 * code, so that approving D-6 costs one setting instead of a day's work, and so
 * the boundary is inspectable: grep for `LLM_PROVIDER` and the entire decision
 * surface is one line.
 *
 * ⛔ NETWORK ACCESS IS INJECTED, NOT IMPORTED. `fetchImpl` is a constructor
 * parameter so tests supply a stub and NO REAL REQUEST IS POSSIBLE in a test
 * run. This adapter has no module-level import that can reach the network.
 *
 * ⛔ THREE THINGS THAT MUST NEVER LEAVE THIS FILE
 *   1. the API key — never logged, never returned, never in an error
 *   2. the request body — it contains the system prompt AND the user's message
 *   3. the provider's error body — O-5 (C2_DONE §5) found FastAPI's 422 echoes
 *      the request; providers do the same, and here the request is personal text
 *
 * Errors are constructed from a STATUS CODE and an ERROR CLASS only. The
 * response body is read for nothing and discarded at this boundary.
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §2.2, §9, §10.
 */

import {
  LlmConfigError,
  LlmMalformedOutputError,
  LlmRateLimitedError,
  LlmTimeoutError,
  LlmUnavailableError,
} from '../errors.js';
import type { LlmProvider, LlmRawResult, LlmRequest } from '../provider.js';

/** OpenAI-compatible chat-completions endpoint. */
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * The subset of `fetch` this adapter uses.
 *
 * Narrow on purpose: a test stub implements three fields rather than the whole
 * Response interface, and the narrowness makes it obvious nothing else is
 * touched.
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface GroqProviderOptions {
  /**
   * Read from server-side configuration ONLY.
   *
   * ⛔ Never reaches the client, never appears in a response, never in a log.
   * `/health` reports the provider name and model, and has no field for a key.
   */
  readonly apiKey: string;
  /** Pinned in config and surfaced in /health — free-tier model IDs get deprecated. */
  readonly model: string;
  /** Injected. Omitting it in production uses global fetch; tests always supply a stub. */
  readonly fetchImpl?: FetchLike;
  readonly endpoint?: string;
}

interface GroqChoice {
  message?: { content?: unknown };
}
interface GroqResponse {
  choices?: GroqChoice[];
  model?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  readonly model: string;

  // ⛔ ECMAScript PRIVATE (#), not TypeScript `private`.
  //
  // TypeScript's `private` is erased at compile time: the field remains an
  // enumerable own property, so JSON.stringify(provider) SERIALISES THE API
  // KEY. A test caught exactly that. `#` is enforced by the runtime and is
  // invisible to JSON.stringify, Object.keys, and structured logging.
  //
  // Do not "simplify" this back to `private`.
  #apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly endpoint: string;

  constructor(options: GroqProviderOptions) {
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      // Distinct from `unavailable`: an operator fault a retry cannot fix.
      throw new LlmConfigError('GROQ_API_KEY is not set');
    }
    if (!options.model || options.model.trim().length === 0) {
      throw new LlmConfigError('LLM_MODEL is not set');
    }

    this.#apiKey = options.apiKey;
    this.model = options.model;
    this.endpoint = options.endpoint ?? GROQ_CHAT_COMPLETIONS_URL;

    const injected = options.fetchImpl;
    if (injected) {
      this.fetchImpl = injected;
    } else {
      const globalFetch = (globalThis as { fetch?: unknown }).fetch;
      if (typeof globalFetch !== 'function') {
        throw new LlmConfigError('no fetch implementation available');
      }
      this.fetchImpl = globalFetch as unknown as FetchLike;
    }
  }

  async complete(request: LlmRequest): Promise<LlmRawResult> {
    const started = Date.now();

    // Timeout is enforced here rather than trusted to the provider: a hung
    // socket would otherwise hold the user's turn open indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    const body = JSON.stringify({
      model: this.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxOutputTokens,
      // Ask for JSON. Even so, parse.ts treats the result as untrusted and
      // performs its own validation — a provider flag is not a guarantee.
      response_format: { type: 'json_object' },
      // Only sent when the caller set one. No temperature is invented here.
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      // No streaming: the outbound constraint layer must see the COMPLETE
      // response before anything reaches the user, and streamed text cannot be
      // retracted (plan §8).
      stream: false,
    });

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          // The ONLY place the key is used. It is never logged or returned.
          Authorization: `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // Only the error CLASS is carried — never the message, which on some
      // runtimes embeds the request URL and headers.
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      if (isAbort) throw new LlmTimeoutError(`aborted after ${request.timeoutMs}ms`);
      throw new LlmUnavailableError(`transport: ${(err as { name?: string })?.name ?? 'Error'}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // ⛔ THE BODY IS NEVER READ. A provider error body commonly echoes the
      // request, and the request contains the user's message. Only the status
      // code crosses this line.
      if (response.status === 429) throw new LlmRateLimitedError(`status ${response.status}`);
      if (response.status === 401 || response.status === 403) {
        throw new LlmConfigError(`status ${response.status}`);
      }
      throw new LlmUnavailableError(`status ${response.status}`);
    }

    let parsed: GroqResponse;
    try {
      parsed = (await response.json()) as GroqResponse;
    } catch {
      throw new LlmMalformedOutputError('response was not JSON');
    }

    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      // Shape fault only — the payload is not quoted.
      throw new LlmMalformedOutputError('response contained no message content');
    }

    const promptTokens = asNumber(parsed.usage?.prompt_tokens);
    const completionTokens = asNumber(parsed.usage?.completion_tokens);
    const servedModel = typeof parsed.model === 'string' ? parsed.model : undefined;

    return {
      text: content,
      elapsedMs: Date.now() - started,
      ...(servedModel === undefined ? {} : { servedModel }),
      ...(promptTokens === undefined && completionTokens === undefined
        ? {}
        : {
            usage: {
              ...(promptTokens === undefined ? {} : { promptTokens }),
              ...(completionTokens === undefined ? {} : { completionTokens }),
            },
          }),
    };
  }
}
