import { Router } from 'express';
import { env } from '../config/env.js';
import { UpstreamHttpClient } from '../clients/httpClient.js';
import { FusionClient } from '../clients/fusion.client.js';
import { checkFusionReadiness, type FusionReadinessResult } from '../readiness/fusionReadiness.js';

export type FusionReadinessChecker = () => Promise<FusionReadinessResult>;

/** Constructed lazily, on first use — importing this module must not open a socket. */
let defaultFusionClient: FusionClient | undefined;
function getDefaultFusionClient(): FusionClient {
  defaultFusionClient ??= new FusionClient(
    new UpstreamHttpClient({ baseUrl: env.FUSION_SERVICE_URL, timeoutMs: env.FUSION_TIMEOUT_MS }),
  );
  return defaultFusionClient;
}

const defaultChecker: FusionReadinessChecker = () =>
  checkFusionReadiness(getDefaultFusionClient(), env.NODE_ENV);

/**
 * `checkFusion` is injectable so tests can exercise the §8.2 guard 2 logic
 * without a real fusion container. `createHealthRouter()` (no args) is what
 * server.ts uses in production.
 */
export function createHealthRouter(checkFusion: FusionReadinessChecker = defaultChecker): Router {
  const router = Router();

  /** Liveness — process is up and serving. No upstream calls. */
  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  /**
   * Readiness. C4 adds the §8.2 guard 2 fusion-placeholder check. The full
   * multi-upstream handshake (fer/sentiment contract verification alongside
   * this) is C6 orchestration — out of scope here.
   */
  router.get('/ready', (_req, res) => {
    checkFusion()
      .then((result) => {
        if (!result.ready) {
          res.status(503).json({ status: 'not_ready', reason: result.reason });
          return;
        }
        res.status(200).json({ status: 'ready', checks: {} });
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
