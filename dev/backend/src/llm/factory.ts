/**
 * Provider selection — the D-6 gate.
 *
 * ⛔ `mock` IS THE DEFAULT AND MUST REMAIN SO until D-6 is explicitly resolved.
 *
 * D-6: whether pregnancy-domain user messages may be sent to a third-party US
 * inference provider. It is a PRIVACY AND ETHICS decision, not an engineering
 * one, and possessing an API key is capability rather than approval.
 *
 * This file is the entire decision surface. Selecting a real provider requires
 * BOTH an explicit `LLM_PROVIDER=groq` AND a key — neither alone is enough, and
 * neither has a default that reaches the network. A misconfiguration therefore
 * fails loudly rather than silently sending personal text somewhere.
 *
 * Plan: docs/plan/backend/LLM_INTEGRATION_PLAN.md §2, §12 D-6.
 */

import { LlmConfigError } from './errors.js';
import type { LlmProvider, LlmProviderInfo } from './provider.js';
import { GroqProvider, type FetchLike } from './providers/groq.js';
import { MockLlmProvider } from './providers/mock.js';

export const LLM_PROVIDER_NAMES = ['mock', 'groq'] as const;
export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

/** ⛔ Changing this is a D-6 decision, not a configuration tidy-up. */
export const DEFAULT_LLM_PROVIDER: LlmProviderName = 'mock';

export interface ProviderSelection {
  readonly providerName?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
  /** Injected for tests. Production passes nothing and global fetch is used. */
  readonly fetchImpl?: FetchLike | undefined;
}

/**
 * Build the configured provider.
 *
 * An unset or unrecognised name resolves to `mock` — the safe direction. An
 * unknown value never reaches the network, and a typo cannot accidentally
 * enable a real provider.
 */
export function createProvider(selection: ProviderSelection = {}): LlmProvider {
  const requested = (selection.providerName ?? DEFAULT_LLM_PROVIDER).trim().toLowerCase();

  if (requested !== 'groq') {
    return new MockLlmProvider();
  }

  // From here on the operator has explicitly asked for a real provider.
  if (!selection.apiKey) {
    throw new LlmConfigError('LLM_PROVIDER=groq but GROQ_API_KEY is not set');
  }
  if (!selection.model) {
    throw new LlmConfigError('LLM_PROVIDER=groq but LLM_MODEL is not set');
  }

  return new GroqProvider({
    apiKey: selection.apiKey,
    model: selection.model,
    ...(selection.fetchImpl === undefined ? {} : { fetchImpl: selection.fetchImpl }),
  });
}

/**
 * Provider identity for `/health`.
 *
 * ⛔ There is no field for the API key, and none may be added.
 *
 * `d6Gate` is reported so an operator can see at a glance whether real user
 * text is capable of leaving the system, without reading configuration.
 */
export function describeProvider(provider: LlmProvider): LlmProviderInfo & {
  readonly d6Gate: 'closed_mock_only' | 'open_real_provider';
} {
  const isMock = provider.name === 'mock';
  return {
    name: provider.name,
    model: provider.model,
    performsNetworkCalls: !isMock,
    d6Gate: isMock ? 'closed_mock_only' : 'open_real_provider',
  };
}
