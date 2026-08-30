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
import { recordConsentEvent } from '../persistence/consentEvents.js';
import { ensureUser } from '../persistence/users.js';

const SESSION_HEADER = 'x-session-id';

function sessionIdOf(req: Request): string | undefined {
  const raw = req.header(SESSION_HEADER);
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** C7 TRAP 2 — a session id that does not exist and one owned by another
 *  user must be externally indistinguishable. Every route below sends this
 *  SAME response for both, and logs the diagnostic kind server-side only. */
function sendSessionNotAccessible(res: Response, sessionId: string, userId: string, diagnostic: 'not_found' | 'wrong_owner'): void {
  logger.warn({ sessionId, userId, diagnostic }, 'session lookup denied (TRAP 2 — externally uniform response)');
  res.status(404).json({ error: { code: 'session_not_found', message: 'No camera session was found for this id.' } });
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
    // C7 (§9.2, O-12): the real app requires auth (server.ts mounts
    // requireAuth ahead of this router), so req.userId is set here in
    // production. A test that constructs this router directly, bypassing
    // that middleware, gets the pre-C7 unscoped behaviour unmodified.
    if (req.userId) {
      store.grantConsentForOwner(sessionId, req.userId);
      const userId = req.userId;
      void ensureUser(userId)
        .then(() => recordConsentEvent(userId, sessionId, 'granted'))
        .catch((err: unknown) => {
        logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'failed to record consent-granted audit event');
      });
    } else {
      store.grantConsent(sessionId);
    }
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
    // C7 TRAP 2 — ownership-checked when authenticated; a session owned by
    // another user is externally indistinguishable from one that never
    // existed.
    if (req.userId) {
      const lookup = store.getForOwner(sessionId, req.userId);
      if (lookup.kind !== 'ok') {
        sendSessionNotAccessible(res, sessionId, req.userId, lookup.kind);
        return;
      }
    }
    // ⛔ Nothing before consent — a pause/resume with no prior consent is not
    // a way to create a session.
    const activated = req.userId
      ? store.setCameraActiveForOwner(sessionId, active, req.userId)
      : store.setCameraActive(sessionId, active);
    if (!activated) {
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
    // C7 TRAP 2 — a session that never existed and one owned by ANOTHER user
    // must be externally IDENTICAL: both 404, same body. This does make
    // revoke slightly less "idempotent-looking" for the rightful owner (a
    // second revoke of the same session now 404s instead of replying
    // 200 again) — that is the correct trade for closing the oracle: the
    // route cannot tell "my own already-revoked id" from "someone else's
    // real session" without the very ownership check TRAP 2 forbids
    // exposing the result of.
    if (req.userId) {
      const lookup = store.getForOwner(sessionId, req.userId);
      if (lookup.kind !== 'ok') {
        sendSessionNotAccessible(res, sessionId, req.userId, lookup.kind);
        return;
      }
      void recordConsentEvent(req.userId, sessionId, 'revoked').catch((err: unknown) => {
        logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'failed to record consent-revoked audit event');
      });
    }
    if (req.userId) store.revokeForOwner(sessionId, req.userId);
    else store.revoke(sessionId);
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

  // C7 TRAP 2 — ownership-checked when authenticated (req.userId set by
  // server.ts's requireAuth ahead of this router in the real app). The
  // resolved owned session is used directly below rather than re-fetched by
  // plain id, so this request can never read/write another owner's — or the
  // legacy unscoped — session sharing the same id string.
  let session;
  if (req.userId) {
    const lookup = store.getForOwner(sessionId, req.userId);
    if (lookup.kind !== 'ok') {
      logger.warn({ sessionId, userId: req.userId, diagnostic: lookup.kind }, 'frame ingest denied (TRAP 2)');
      res.status(403).json({ accepted: false, reason: 'no_consent' });
      return;
    }
    session = lookup.session;
  } else {
    session = store.get(sessionId);
  }
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

    const recorded = req.userId
      ? store.recordFrameForOwner(sessionId, outcome.data.probabilities, outcome.data.model_version, req.userId)
      : store.recordFrame(sessionId, outcome.data.probabilities, outcome.data.model_version);
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
