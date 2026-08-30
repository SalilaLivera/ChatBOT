/**
 * ★ C3B — camera session lifecycle + frame ingest endpoints
 * (BACKEND_IMPLEMENTATION_PLAN.md §10, C3B_PLAN.md §6 / Part D).
 *
 *   POST   /api/v1/session/camera/consent  { granted: true }  -> create accumulator
 *   POST   /api/v1/session/camera/state    { active: bool }    -> PAUSE / RESUME (RETAINS)
 *   DELETE /api/v1/session/camera                              -> REVOKE (PURGES now)
 *   POST   /api/v1/session/frame           multipart "image"
 *          -> { accepted: true, frame_count } | { accepted: false, reason }
 *
 * ⛔ `POST /session/frame` returns NO mood and NO per-frame prediction. Only
 * the averaged value at message time is a mood, and that is computed elsewhere
 * (C6 wires the user-facing turn — NOT built here).
 *
 * ⛔ Nothing is captured or accepted before consent.
 *
 * ⛔ This router does NOT import the 7→3 evidence adapter (CI guard,
 * C3B_PLAN.md §10) and does NOT call fusion (C4 owns fusion). The
 * mean→adapter wiring lives in `capture/turnFaceEvidence.ts` and is exercised
 * by C6, not by any route here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ LOGGING (C3B_PLAN.md §6.1, O-5). The frame body is multipart image bytes.
 * This router never logs `req.body`, never echoes it in an error, and never
 * logs a per-frame probability vector. Only frame COUNT / reason strings.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Session identity: a client-supplied `x-session-id` header — one per page
 * instance (§3A.4). ⚠ C7 replaces this with the authenticated session; there
 * is no auth in this phase.
 */
import express, { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { UpstreamHttpClient } from '../clients/httpClient.js';
import { FerClient, FER_MAX_UPLOAD_BYTES } from '../clients/fer.client.js';
import { SessionStore, sessionStore as defaultStore } from '../capture/sessionStore.js';
import { BackpressureLimiter, backpressureLimiter as defaultLimiter } from '../capture/backpressure.js';
import { extractImageField } from '../capture/multipart.js';
import { logger } from '../logging/logger.js';

const SESSION_HEADER = 'x-session-id';

function sessionIdOf(req: Request): string | undefined {
  const raw = req.header(SESSION_HEADER);
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

export interface SessionRouterDeps {
  store?: SessionStore;
  limiter?: BackpressureLimiter;
  ferClient?: FerClient;
}

let lazyFerClient: FerClient | undefined;
function getDefaultFerClient(): FerClient {
  lazyFerClient ??= new FerClient(
    new UpstreamHttpClient({ baseUrl: env.FER_SERVICE_URL, timeoutMs: env.FER_TIMEOUT_MS }),
  );
  return lazyFerClient;
}

export function createSessionRouter(deps: SessionRouterDeps = {}): Router {
  const store = deps.store ?? defaultStore;
  const limiter = deps.limiter ?? defaultLimiter;
  const getFer = (): FerClient => deps.ferClient ?? getDefaultFerClient();

  const router = Router();
  const jsonBody = express.json({ limit: '1kb' });

  // POST /api/v1/session/camera/consent  { granted: true }
  router.post('/api/v1/session/camera/consent', jsonBody, (req, res) => {
    const sessionId = sessionIdOf(req);
    if (!sessionId) {
      res.status(400).json({ error: { code: 'session_id_required', message: `${SESSION_HEADER} header is required.` } });
      return;
    }
    if ((req.body as { granted?: unknown } | undefined)?.granted !== true) {
      res.status(400).json({ error: { code: 'consent_not_granted', message: 'granted must be true.' } });
      return;
    }
    store.grantConsent(sessionId);
    logger.info({ sessionId }, 'camera consent granted; accumulator created');
    res.status(201).json({ ok: true });
  });

  // POST /api/v1/session/camera/state  { active: bool }  -> PAUSE / RESUME
  router.post('/api/v1/session/camera/state', jsonBody, (req, res) => {
    const sessionId = sessionIdOf(req);
    if (!sessionId) {
      res.status(400).json({ error: { code: 'session_id_required', message: `${SESSION_HEADER} header is required.` } });
      return;
    }
    const active = (req.body as { active?: unknown } | undefined)?.active;
    if (typeof active !== 'boolean') {
      res.status(400).json({ error: { code: 'invalid_state', message: 'active must be a boolean.' } });
      return;
    }
    // ⛔ Nothing before consent — a pause/resume with no prior consent is not
    // a way to create a session.
    if (!store.setCameraActive(sessionId, active)) {
      res.status(409).json({ error: { code: 'no_consent', message: 'Camera consent has not been granted for this session.' } });
      return;
    }
    // ✅ PAUSE RETAINS the accumulator (§3A.10.2). Re-activation's snapshot is
    // an ordinary frame posted by the client to /session/frame — no special
    // case here.
    logger.info({ sessionId, active }, active ? 'camera resumed (accumulator retained)' : 'camera paused (accumulator retained)');
    res.status(200).json({ active });
  });

  // DELETE /api/v1/session/camera  -> REVOKE: PURGES immediately
  router.delete('/api/v1/session/camera', (req, res) => {
    const sessionId = sessionIdOf(req);
    if (!sessionId) {
      res.status(400).json({ error: { code: 'session_id_required', message: `${SESSION_HEADER} header is required.` } });
      return;
    }
    store.revoke(sessionId);
    limiter.forget(sessionId);
    logger.info({ sessionId }, 'camera consent revoked; accumulator purged');
    res.status(200).json({ revoked: true });
  });

  // POST /api/v1/session/frame  multipart "image"
  router.post(
    '/api/v1/session/frame',
    express.raw({ type: 'multipart/form-data', limit: FER_MAX_UPLOAD_BYTES }),
    (req, res) => {
      void handleFrame(req, res, store, limiter, getFer());
    },
  );

  return router;
}

async function handleFrame(
  req: Request,
  res: Response,
  store: SessionStore,
  limiter: BackpressureLimiter,
  ferClient: FerClient,
): Promise<void> {
  const sessionId = sessionIdOf(req);
  if (!sessionId) {
    res.status(400).json({ accepted: false, reason: 'session_id_required' });
    return;
  }

  const session = store.get(sessionId);
  // ⛔ Nothing is captured or accepted before consent.
  if (!session) {
    res.status(403).json({ accepted: false, reason: 'no_consent' });
    return;
  }
  // Paused — capture should be stopped client-side; reject defensively.
  if (!session.cameraActive) {
    res.status(409).json({ accepted: false, reason: 'camera_inactive' });
    return;
  }

  const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const extracted = extractImageField(req.header('content-type'), body);
  if (!extracted.ok) {
    // ⛔ never echo the body — only the reason.
    res.status(400).json({ accepted: false, reason: 'invalid_multipart' });
    return;
  }

  // ⛔ Back-pressure: DROP, never queue (§3A.6 / Part C).
  if (!limiter.tryAcquire(sessionId)) {
    res.status(200).json({ accepted: false, reason: 'dropped_backpressure' });
    return;
  }

  try {
    const outcome = await ferClient.predict(extracted.image, res.getHeader('x-request-id')?.toString());

    // ⛔ TRAP 3 — anything that is not a valid FER 200 contributes NOTHING.
    // count is not touched; no zero / uniform / neutral vector is fabricated.
    if (outcome.kind !== 'success') {
      res.status(200).json({ accepted: false, reason: 'frame_not_processed' });
      return;
    }

    const recorded = store.recordFrame(sessionId, outcome.data.probabilities, outcome.data.model_version);
    if (!recorded.ok) {
      // Session was revoked/paused between the consent check and here.
      res.status(200).json({ accepted: false, reason: recorded.reason });
      return;
    }

    if (recorded.reset) {
      // ⛔ FER model_version changed mid-session — reset recorded (§3A.4).
      logger.warn(
        { sessionId, newModelVersion: outcome.data.model_version },
        'FER model_version changed mid-session; accumulator reset',
      );
    }

    // ⛔ NO mood, NO per-frame prediction in the response.
    res.status(200).json({ accepted: true, frame_count: recorded.frameCount });
  } catch (err) {
    // ⛔ never include the body or a vector in the log.
    logger.error({ sessionId, err: err instanceof Error ? err.message : 'unknown' }, 'frame ingest failed');
    res.status(200).json({ accepted: false, reason: 'frame_not_processed' });
  } finally {
    limiter.release(sessionId);
  }
}

/** Default router instance for server.ts. */
export const sessionRouter = createSessionRouter();
