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
import { sessionStore as defaultStore, type SessionStore } from '../capture/sessionStore.js';
import { analyseMood, type MoodServiceDeps, type MoodAnalyseResponseBody } from '../mood/moodService.js';
import { insertMoodObservation } from '../persistence/moodObservations.js';
import { ensureUser } from '../persistence/users.js';
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
  const rawSessionId = sessionIdOf(req);
  const correlationId = res.getHeader('x-request-id')?.toString();

  // C7 TRAP 2 — ownership-checked when authenticated (req.userId set by
  // server.ts's requireAuth ahead of this router in the real app). A session
  // id that does not exist, or belongs to another user, is silently dropped
  // — the turn proceeds text-only, exactly like "camera never enabled"
  // (D-35) — rather than surfaced as any kind of error that would leak
  // whether the id exists.
  let sessionId = rawSessionId;
  const storeWithOwnership = deps.sessionStore as Pick<SessionStore, 'get'> &
    Partial<Pick<SessionStore, 'getForOwner'>>;
  if (req.userId && rawSessionId && typeof storeWithOwnership.getForOwner === 'function') {
    const owned = storeWithOwnership.getForOwner(rawSessionId, req.userId);
    if (owned.kind !== 'ok') {
      logger.warn(
        { sessionId: rawSessionId, userId: req.userId, diagnostic: owned.kind },
        'mood analyse: session not accessible (TRAP 2) — proceeding text-only',
      );
      sessionId = undefined;
    }
  }

  const text = (req.body as { text?: unknown } | undefined)?.text;
  if (typeof text !== 'string') {
    res.status(400).json({ error: { code: 'text_required', message: 'text is required and must be a string.' } });
    return;
  }

  try {
    const outcome = await analyseMood({ sessionId, ownerId: req.userId, text, correlationId }, deps);

    switch (outcome.kind) {
      case 'ok':
        res.status(200).json(outcome.body);
        // C7 Part B / TRAP 4 — persist the durable mood observation for an
        // authenticated caller. `parameters_provenance` is required
        // (NOT NULL, no default): in non-production it is already on the
        // response body (§8.2 guard 3); in production guard 3 omits it from
        // the response, so it is fetched here from fusion's own /health —
        // the same call moodService.ts makes for non-production — purely so
        // the stored row is never unattributable. This does not change
        // orchestration or the response the client sees.
        if (req.userId) {
          void persistMoodObservation(req.userId, outcome.body, deps, correlationId).catch((err: unknown) => {
            logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'failed to persist mood observation');
          });
        }
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

const PLACEHOLDER_PROVENANCE_UNAVAILABLE_PROD =
  'PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE (fusion health check unavailable at persistence time — provenance could not be confirmed live)';

async function persistMoodObservation(
  userId: string,
  body: MoodAnalyseResponseBody,
  deps: MoodServiceDeps,
  correlationId: string | undefined,
): Promise<void> {
  let parametersProvenance = body.parameters_provenance;
  if (!parametersProvenance) {
    // production — guard 3 omitted it from the response body; fetch it
    // directly for storage only (never returned to the client).
    const health = await deps.fusionClient.health(correlationId);
    parametersProvenance = health.ok ? health.data.parameters_provenance : PLACEHOLDER_PROVENANCE_UNAVAILABLE_PROD;
  }

  await ensureUser(userId);
  await insertMoodObservation({
    userId,
    conversationId: null,
    state: body.state,
    confidence: body.confidence,
    modalitiesUsed: body.modalities_used,
    fusionVersion: body.fusion_version,
    faceModelVersion: body.model_versions.face,
    textModelVersion: body.model_versions.text,
    parametersProvenance,
    frameCount: body.face_frame_count,
    sessionElapsedMs: body.session_elapsed_ms,
  });
}

/** Default router instance for server.ts. */
export const moodRouter = createMoodRouter();
