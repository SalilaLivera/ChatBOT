/**
 * ★ C6 — POST /api/v1/mood/analyse (BACKEND_IMPLEMENTATION_PLAN.md §10,
 * §10.1; C6_PLAN.md §5, §9).
 *
 * ⛔ This router does NOT import the 7→3 evidence adapter module (the one
 * under `src/evidence/`, named for the lowercase word this file must never
 * contain — see C3's `ciGreps` route-import guard, asserted unedited per
 * C6_PLAN.md §6). The face path goes through
 * `capture/turnFaceEvidence.computeTurnFaceEvidence()` (capital F), called
 * from `mood/moodService.ts`, never from here directly.
 *
 * This file is deliberately thin: parse the request, call the service, map
 * its typed outcome to an HTTP response. All orchestration — language
 * routing, the sentiment call, the mandatory fusion call, response assembly —
 * lives in `moodService.ts`.
 */
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { UpstreamHttpClient } from '../clients/httpClient.js';
import { SentimentClient } from '../clients/sentiment.client.js';
import { FusionClient } from '../clients/fusion.client.js';
import { sessionStore as defaultStore } from '../capture/sessionStore.js';
import { analyseMood, type MoodServiceDeps } from '../mood/moodService.js';
import { logger } from '../logging/logger.js';

const SESSION_HEADER = 'x-session-id';

function sessionIdOf(req: Request): string | undefined {
  const raw = req.header(SESSION_HEADER);
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

export interface MoodRouterDeps {
  deps?: MoodServiceDeps;
}

let lazySentimentClient: SentimentClient | undefined;
function getDefaultSentimentClient(): SentimentClient {
  lazySentimentClient ??= new SentimentClient(
    new UpstreamHttpClient({ baseUrl: env.SENTIMENT_SERVICE_URL, timeoutMs: env.SENTIMENT_TIMEOUT_MS }),
  );
  return lazySentimentClient;
}

let lazyFusionClient: FusionClient | undefined;
function getDefaultFusionClient(): FusionClient {
  lazyFusionClient ??= new FusionClient(
    new UpstreamHttpClient({ baseUrl: env.FUSION_SERVICE_URL, timeoutMs: env.FUSION_TIMEOUT_MS }),
  );
  return lazyFusionClient;
}

function getDefaultDeps(): MoodServiceDeps {
  return {
    sessionStore: defaultStore,
    sentimentClient: getDefaultSentimentClient(),
    fusionClient: getDefaultFusionClient(),
    languageBounds: { siRatioHigh: env.LANGUAGE_SI_RATIO_HIGH, siRatioLow: env.LANGUAGE_SI_RATIO_LOW },
    languagePolicy: env.LANGUAGE_POLICY,
    nodeEnv: env.NODE_ENV,
  };
}

export function createMoodRouter(routerDeps: MoodRouterDeps = {}): Router {
  const router = Router();

  router.post('/api/v1/mood/analyse', (req, res) => {
    void handleAnalyse(req, res, routerDeps.deps ?? getDefaultDeps());
  });

  return router;
}

async function handleAnalyse(req: Request, res: Response, deps: MoodServiceDeps): Promise<void> {
  const sessionId = sessionIdOf(req);
  const correlationId = res.getHeader('x-request-id')?.toString();

  const text = (req.body as { text?: unknown } | undefined)?.text;
  if (typeof text !== 'string') {
    res.status(400).json({ error: { code: 'text_required', message: 'text is required and must be a string.' } });
    return;
  }

  try {
    const outcome = await analyseMood({ sessionId, text, correlationId }, deps);

    switch (outcome.kind) {
      case 'ok':
        res.status(200).json(outcome.body);
        return;
      case 'rejected':
        res.status(outcome.httpStatus).json({ error: { code: outcome.code, message: outcome.message } });
        return;
      case 'upstream_unavailable':
        // ⛔ TRAP 2 — 503 to the caller. The circuit is already open (the
        // client layer trips it on the observed 503); this route issues NO
        // retry of its own.
        res.status(503).json({ error: { code: outcome.code, message: outcome.message } });
        return;
    }
  } catch (err) {
    // ⛔ never log message text, never echo the request body.
    logger.error({ requestId: correlationId, err: err instanceof Error ? err.message : 'unknown' }, 'mood analysis failed');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'an unexpected error occurred' } });
  }
}

/** Default router instance for server.ts. */
export const moodRouter = createMoodRouter();
