import { Router } from 'express';

export const healthRouter = Router();

/** Liveness — process is up and serving. No upstream calls. */
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Readiness — C1 STUB ONLY.
 *
 * The real readiness handshake (verifying all three upstream services respond
 * to /health, reporting the pinned artifact identity, and the §8.2 fusion
 * placeholder handshake) is C2/C4. C1 talks to nothing (standing rule / C1
 * scope boundary) so this always reports ready with an empty check set.
 */
healthRouter.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', checks: {} });
});
