/**
 * Groq adapter tests — ENTIRELY THROUGH A STUBBED HTTP LAYER.
 *
 * ⛔ NO REAL NETWORK REQUEST OCCURS IN THIS FILE. Every test injects a
 * `fetchImpl`, and one test asserts that a constructed provider makes no call
 * at all until `complete()` is invoked. D-6 is unresolved; a test suite that
 * reached Groq would itself be the thing D-6 governs.
 *
 * The leak assertions matter as much as the behavioural ones: the request body
 * carries the system prompt AND the user's message, and the Authorization
 * header carries the key.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  LlmConfigError,
  LlmMalformedOutputError,
  LlmRateLimitedError,
  LlmTimeoutError,
  LlmUnavailableError,
} from '../../../src/llm/errors.js';
import { DEFAULT_LLM_PROVIDER, createProvider, describeProvider } from '../../../src/llm/factory.js';
import { GroqProvider, type FetchLike } from '../../../src/llm/providers/groq.js';
import type { LlmRequest } from '../../../src/llm/provider.js';

const API_KEY = 'gsk_TEST_KEY_NOT_REAL_0000000000';
const MODEL = 'test-model-8b';

const REQUEST: LlmRequest = {
  messages: [
    { role: 'system', content: 'You are a supportive companion.' },
    { role: 'user', content: 'I have been feeling anxious about the scan' },
  ],
  maxOutputTokens: 400,
  timeoutMs: 20_000,
};

function okResponse(content = '{"message":"I am here with you."}') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      model: MODEL,
      usage: { prompt_tokens: 42, completion_tokens: 11 },
    }),
  };
}

function stubFetch(impl: FetchLike) {
  return vi.fn(impl) as unknown as FetchLike & { mock: { calls: unknown[][] } };
}

function provider(fetchImpl: FetchLike) {
  return new GroqProvider({ apiKey: API_KEY, model: MODEL, fetchImpl });
}

// ---------------------------------------------------------------------------
// No real network
// ---------------------------------------------------------------------------

describe('⛔ no real network access', () => {
  it('makes no call when merely constructed', () => {
    const fetchImpl = stubFetch(async () => okResponse());
    provider(fetchImpl);
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it('uses the injected fetch, never a global one', async () => {
    const fetchImpl = stubFetch(async () => okResponse());
    await provider(fetchImpl).complete(REQUEST);
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Configuration and the API key
// ---------------------------------------------------------------------------

describe('API key handling', () => {
  it('refuses to construct without a key', () => {
    expect(() => new GroqProvider({ apiKey: '', model: MODEL })).toThrow(LlmConfigError);
  });

  it('refuses to construct without a model', () => {
    expect(() => new GroqProvider({ apiKey: API_KEY, model: '' })).toThrow(LlmConfigError);
  });

  it('sends the key as a bearer token — the only place it is used', async () => {
    let seenAuth: string | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      seenAuth = init.headers['Authorization'];
      return okResponse();
    };
    await provider(fetchImpl).complete(REQUEST);
    expect(seenAuth).toBe(`Bearer ${API_KEY}`);
  });

  it('⛔ never exposes the key on the provider object', () => {
    const p = provider(stubFetch(async () => okResponse()));
    expect(JSON.stringify(p)).not.toContain(API_KEY);
    expect(JSON.stringify(describeProvider(p))).not.toContain(API_KEY);
  });

  it('⛔ never puts the key in an error', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}) });
    try {
      await provider(fetchImpl).complete(REQUEST);
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as LlmConfigError;
      expect(e).toBeInstanceOf(LlmConfigError);
      expect(JSON.stringify({ m: e.message, d: e.detail })).not.toContain(API_KEY);
    }
  });
});

// ---------------------------------------------------------------------------
// Request construction
// ---------------------------------------------------------------------------

describe('request construction', () => {
  it('posts the pinned model, messages, token cap and JSON mode', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_url, init) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return okResponse();
    };
    await provider(fetchImpl).complete(REQUEST);

    expect(body['model']).toBe(MODEL);
    expect(body['max_tokens']).toBe(400);
    expect(body['response_format']).toEqual({ type: 'json_object' });
    expect(body['messages']).toHaveLength(2);
  });

  it('⛔ never streams — the outbound filter must see the whole response', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_url, init) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return okResponse();
    };
    await provider(fetchImpl).complete(REQUEST);
    expect(body['stream']).toBe(false);
  });

  it('omits temperature entirely when the caller sets none', async () => {
    // No temperature is invented at this layer — see provider.ts.
    let body: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_url, init) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return okResponse();
    };
    await provider(fetchImpl).complete(REQUEST);
    expect('temperature' in body).toBe(false);
  });

  it('includes temperature when the caller supplies one', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_url, init) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return okResponse();
    };
    await provider(fetchImpl).complete({ ...REQUEST, temperature: 0.4 });
    expect(body['temperature']).toBe(0.4);
  });
});

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

describe('response parsing', () => {
  it('returns the message content, model and usage', async () => {
    const r = await provider(stubFetch(async () => okResponse())).complete(REQUEST);
    expect(r.text).toBe('{"message":"I am here with you."}');
    expect(r.servedModel).toBe(MODEL);
    expect(r.usage?.promptTokens).toBe(42);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects a response with no choices', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}) });
    await expect(provider(fetchImpl).complete(REQUEST)).rejects.toBeInstanceOf(
      LlmMalformedOutputError,
    );
  });

  it('rejects a non-JSON response body', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(provider(fetchImpl).complete(REQUEST)).rejects.toBeInstanceOf(
      LlmMalformedOutputError,
    );
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe('error mapping to the existing typed errors', () => {
  const statusCases: [number, unknown][] = [
    [429, LlmRateLimitedError],
    [401, LlmConfigError],
    [403, LlmConfigError],
    [500, LlmUnavailableError],
    [503, LlmUnavailableError],
  ];

  for (const [status, expected] of statusCases) {
    it(`maps HTTP ${status}`, async () => {
      const fetchImpl: FetchLike = async () => ({ ok: false, status, json: async () => ({}) });
      await expect(provider(fetchImpl).complete(REQUEST)).rejects.toBeInstanceOf(
        expected as new () => Error,
      );
    });
  }

  it('maps a transport failure to unavailable', async () => {
    const fetchImpl: FetchLike = async () => {
      throw Object.assign(new Error('ECONNREFUSED'), { name: 'TypeError' });
    };
    await expect(provider(fetchImpl).complete(REQUEST)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it('maps an abort to timeout', async () => {
    const fetchImpl: FetchLike = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    await expect(provider(fetchImpl).complete(REQUEST)).rejects.toBeInstanceOf(LlmTimeoutError);
  });

  it('⛔ never reads the error body — it can echo the request (O-5)', async () => {
    const jsonSpy = vi.fn(async () => ({ echoed: 'THE USER MESSAGE' }));
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, json: jsonSpy });
    await expect(provider(fetchImpl).complete(REQUEST)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('⛔ no error carries the user text', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    try {
      await provider(fetchImpl).complete(REQUEST);
    } catch (err) {
      const e = err as LlmUnavailableError;
      expect(JSON.stringify({ m: e.message, d: e.detail })).not.toContain('anxious about the scan');
    }
  });
});

// ---------------------------------------------------------------------------
// The D-6 gate
// ---------------------------------------------------------------------------

describe('⛔ D-6 gate — mock is the default', () => {
  it('DEFAULT_LLM_PROVIDER is mock', () => {
    expect(DEFAULT_LLM_PROVIDER).toBe('mock');
  });

  it('returns the mock when nothing is configured', () => {
    const p = createProvider();
    expect(p.name).toBe('mock');
    expect(describeProvider(p).performsNetworkCalls).toBe(false);
    expect(describeProvider(p).d6Gate).toBe('closed_mock_only');
  });

  it('returns the mock for an unrecognised provider name — fails safe', () => {
    expect(createProvider({ providerName: 'openai' }).name).toBe('mock');
    expect(createProvider({ providerName: '' }).name).toBe('mock');
  });

  it('⛔ a key alone does NOT enable groq', () => {
    // Both an explicit name AND a key are required; neither suffices.
    expect(createProvider({ apiKey: API_KEY, model: MODEL }).name).toBe('mock');
  });

  it('refuses groq without a key rather than silently falling back', () => {
    // Failing loudly is correct: a silent fallback would hide a
    // misconfiguration that an operator believed had enabled a real provider.
    expect(() => createProvider({ providerName: 'groq', model: MODEL })).toThrow(LlmConfigError);
  });

  it('constructs groq only when explicitly named AND fully configured', () => {
    const p = createProvider({
      providerName: 'groq',
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl: stubFetch(async () => okResponse()),
    });
    expect(p.name).toBe('groq');
    expect(describeProvider(p).d6Gate).toBe('open_real_provider');
  });
});
