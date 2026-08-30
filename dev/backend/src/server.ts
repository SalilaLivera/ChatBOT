import express from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './routes/health.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { moodRouter } from './routes/mood.routes.js';
import { createConversationsRouter } from './routes/conversations.routes.js';
import { requireAuth } from './auth/authMiddleware.js';
import { createSupabaseJwks, type TokenVerificationKey } from './auth/tokens.js';
import { FixedWindowLimiter, rateLimitMiddleware } from './ratelimit/rateLimiter.js';

/**
 * ★ C7 — §9.2: every mood and session endpoint requires authentication.
 * Mounted here, ahead of `sessionRouter`/`moodRouter`, rather than inside
 * those router files, so the router-level unit/integration tests built in
 * earlier phases (which construct `createSessionRouter()`/
 * `createMoodRouter()` directly, bypassing this app assembly) keep exercising
 * router LOGIC unauthenticated and continue to pass unmodified — auth is the
 * real app's concern, enforced here, not each router's own.
 *
 * Part C — rate limiting (owner-decided, provisional engineering limits,
 * §9.4): the face path is limited more tightly than the text path; both
 * share a per-IP aggregate. In-memory, fixed window — no durability
 * requirement rides on this state (unlike the session accumulator).
 */
const perUserFaceLimiter = new FixedWindowLimiter(env.RATE_LIMIT_WINDOW_MS);
const perUserTextLimiter = new FixedWindowLimiter(env.RATE_LIMIT_WINDOW_MS);
const ipLimiter = new FixedWindowLimiter(env.RATE_LIMIT_WINDOW_MS);

/**
 * ★ Follow-up packet 3, step 3 — CORS. An explicit origin ALLOWLIST read from
 * configuration (CORS_ALLOWED_ORIGINS). ⛔ Never `*`.
 *
 * Auth here is a bearer token, not a cookie (`Authorization` header, verified
 * in auth/authMiddleware.ts) — `credentials: true` is therefore never
 * enabled, which also sidesteps the `*`-with-credentials failure mode
 * entirely.
 *
 * ⛔ The detail that decides whether this works at all: the app sends
 * `authorization` AND the custom `x-session-id` header. Both make every
 * request non-simple, so the browser sends a preflight `OPTIONS` first — if
 * that preflight does not list both as allowed, every request silently fails
 * client-side with no server-visible error. Both are listed below.
 *
 * A disallowed origin gets no CORS headers at all (the request is not
 * rejected server-side — `requireAuth` still runs — it is simply left
 * unusable from that origin's browser, per the `cors` package's documented
 * behaviour for a non-matching origin callback).
 */
const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // No Origin header (curl, server-to-server, same-origin) — not a CORS
    // request at all; nothing to allow or deny.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type', 'x-session-id'],
  credentials: false,
};

/**
 * ⛔ `authKey` is INJECTABLE, defaulting to the real Supabase project's JWKS.
 * Production and the CI stack use the default; tests that need to sign their
 * own tokens (integration auth/ownership tests) pass a local public key here
 * instead — they can then sign matching private-key tokens WITHOUT any
 * network call or dependency on a real Supabase project existing. Never build
 * a second `createSupabaseJwks` per request — this default is constructed
 * once, at call time, and normal callers (main(), which calls this exactly
 * once) get exactly one resolver for the process.
 */
export function buildApp(authKey: TokenVerificationKey = createSupabaseJwks(env.SUPABASE_URL)): express.Express {
  const app = express();
  const jwks = authKey;

  app.use(cors(corsOptions));
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  // ★ C7 (revised) — no local auth.routes.ts: Supabase issues, refreshes and
  // revokes tokens directly to the client. This backend only verifies them
  // (auth/authMiddleware.ts) — it is not a second JWT issuer.
  app.use(healthRouter);

  app.use('/api/v1/session', requireAuth(jwks));
  app.use(
    '/api/v1/session/frame',
    rateLimitMiddleware(perUserFaceLimiter, env.RATE_LIMIT_FACE_PER_MIN, ipLimiter, env.RATE_LIMIT_IP_PER_MIN),
  );
  app.use(sessionRouter);

  app.use(
    '/api/v1/mood/analyse',
    requireAuth(jwks),
    rateLimitMiddleware(perUserTextLimiter, env.RATE_LIMIT_TEXT_PER_MIN, ipLimiter, env.RATE_LIMIT_IP_PER_MIN),
  );
  app.use(moodRouter);

  app.use(createConversationsRouter(jwks));

  app.use(errorHandler);

  return app;
}

export function start(): void {
  const app = buildApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutdown signal received, closing server');
    server.close((err) => {
      if (err) {
        logger.error({ err: err.message }, 'error during shutdown');
        process.exit(1);
      }
      logger.info('server closed cleanly');
      process.exit(0);
    });

    // Force-exit if connections do not drain in time.
    setTimeout(() => {
      logger.error('shutdown grace period exceeded, forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
