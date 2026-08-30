import { Router } from 'express';
import { env } from '../config/env.js';
import { UpstreamHttpClient } from '../clients/httpClient.js';
import { FerClient } from '../clients/fer.client.js';
import { SentimentClient } from '../clients/sentiment.client.js';
import { FusionClient } from '../clients/fusion.client.js';
import { checkReadiness, type ReadinessResult } from '../readiness/readiness.js';
import { createProvider, describeProvider } from '../llm/factory.js';

// ⛔ CORRECTION (2026-08-30) — `describeProvider().d6Gate` was designed and
// built so an operator could see whether user text is capable of leaving the
// system without reading configuration, but it was never actually wired into
// `/health`. The D-6 planning docs claimed it already was; they were wrong.
// Fixed here, not worked around — this is exactly the "marking without
// visibility" gap D-6's own reasoning is about.
//
// Constructed lazily, same pattern as the upstream clients below — reading
// the provider identity must never itself perform a network call (the mock
// provider never does; Groq's constructor doesn't either).
let defaultProvider: ReturnType<typeof createProvider> | undefined;
function getDefaultProvider(): ReturnType<typeof createProvider> {
  defaultProvider ??= createProvider({
    providerName: env.LLM_PROVIDER,
    apiKey: env.GROQ_API_KEY,
    model: env.LLM_MODEL,
  });
  return defaultProvider;
}

export type ReadinessChecker = () => Promise<ReadinessResult>;

/** Constructed lazily, on first use — importing this module must not open a socket. */
let defaultFerClient: FerClient | undefined;
function getDefaultFerClient(): FerClient {
  defaultFerClient ??= new FerClient(new UpstreamHttpClient({ baseUrl: env.FER_SERVICE_URL, timeoutMs: env.FER_TIMEOUT_MS }));
  return defaultFerClient;
}

let defaultSentimentClient: SentimentClient | undefined;
function getDefaultSentimentClient(): SentimentClient {
  defaultSentimentClient ??= new SentimentClient(
    new UpstreamHttpClient({ baseUrl: env.SENTIMENT_SERVICE_URL, timeoutMs: env.SENTIMENT_TIMEOUT_MS }),
  );
  return defaultSentimentClient;
}

let defaultFusionClient: FusionClient | undefined;
function getDefaultFusionClient(): FusionClient {
  defaultFusionClient ??= new FusionClient(
    new UpstreamHttpClient({ baseUrl: env.FUSION_SERVICE_URL, timeoutMs: env.FUSION_TIMEOUT_MS }),
  );
  return defaultFusionClient;
}

const defaultChecker: ReadinessChecker = () =>
  checkReadiness({
    ferClient: getDefaultFerClient(),
    sentimentClient: getDefaultSentimentClient(),
    fusionClient: getDefaultFusionClient(),
    // ★ Follow-up packet 3 / D-42 — DEPLOYMENT_POSTURE, not NODE_ENV.
    posture: env.DEPLOYMENT_POSTURE,
  });

// ★ D-42 — the fixed limitations text shown under `research_demo` when
// fusion parameters are placeholder. Naming at least these five is a
// requirement of the decision (C7_DECISIONS_AND_GAPS.md D-42 / D-41), not a
// style choice — each line names a real, currently-true limitation.
const RESEARCH_DEMO_LIMITATIONS = [
  'fusion parameters are placeholder/research-informed development defaults, NOT Phase 7 measurements (C9 pending)',
  'unvalidated in the modality-conflict regime: W_face determines whether a face-NEUTRAL / text-DISTRESSED conflict resolves to distressed',
  'safety detection (M8) NOT EVALUATED - no detector exists',
  "conversational responses are app-owned fallback text; the LLM provider is 'mock' (D-6 unresolved)",
  'not for clinical use; no output may be presented as a measured result',
] as const;

/**
 * `checkReadiness` is injectable so tests can exercise `/ready` without a
 * real three-container stack. `createHealthRouter()` (no args) is what
 * server.ts uses in production.
 *
 * ★ C7 Part D (D-32) — the full multi-upstream handshake: all three
 * upstreams must respond AND report their pinned artifact identity, plus the
 * §8.2 placeholder guard. Liveness (`/health`) and readiness (`/ready`)
 * remain distinct — `/health` makes no upstream call.
 */
export function createHealthRouter(checkReady: ReadinessChecker = defaultChecker): Router {
  const router = Router();

  /**
   * Liveness — process is up and serving. No upstream calls.
   *
   * ⛔ D-6 — `d6Gate` is included so an operator can see whether real user
   * text is CAPABLE of leaving the system without reading configuration.
   * `describeProvider()` never performs a network call and never includes
   * the API key — see `llm/factory.ts`.
   */
  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', llm: describeProvider(getDefaultProvider()) });
  });

  /**
   * Readiness — see module header. ★ D-42 (follow-up packet 3, step 4): under
   * `research_demo`, a placeholder-parameters fusion still reports ready
   * (200), but with an explicit `limitations` array — it never reports ready
   * silently. Under `strict` (the default) the response is byte-for-byte the
   * original §8.2 behaviour: 503 while placeholder. A broken upstream is
   * never excused by posture in either case — `result.ready` is only true
   * when every upstream actually responded.
   */
  router.get('/ready', (_req, res) => {
    checkReady()
      .then((result) => {
        if (!result.ready) {
          res.status(503).json({ status: 'not_ready', checks: result.checks });
          return;
        }
        if (result.posture === 'research_demo' && result.parametersArePlaceholder) {
          res.status(200).json({
            status: 'ready',
            posture: 'research_demo',
            limitations: RESEARCH_DEMO_LIMITATIONS,
            checks: result.checks,
          });
          return;
        }
        res.status(200).json({ status: 'ready', checks: result.checks });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'unknown error';
        res.status(503).json({ status: 'not_ready', reason: message });
      });
  });

  return router;
}

/** Default router instance, for convenience where injection is not needed. */
export const healthRouter = createHealthRouter();
