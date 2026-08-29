/**
 * §8.2 guard 2 — the readiness handshake. The Node backend calls fusion's
 * GET /health and refuses to report ready if `parameters_are_placeholder` is
 * true while running in production. Built now (C4), even though full
 * orchestration is C6 — this specific guard is explicitly C4's to build
 * (C4_PLAN.md §3.3: "C4 builds 1, 2 and 4. Guard 3 lands with the mood
 * response in C6.").
 */
import type { FusionClient } from '../clients/fusion.client.js';

export interface FusionReadinessResult {
  ready: boolean;
  reason?: string;
}

export async function checkFusionReadiness(
  client: FusionClient,
  nodeEnv: string,
): Promise<FusionReadinessResult> {
  const health = await client.health();
  if (!health.ok) {
    return { ready: false, reason: `fusion health check failed: ${health.reason}` };
  }
  if (nodeEnv === 'production' && health.data.parameters_are_placeholder) {
    return {
      ready: false,
      reason:
        'fusion parameters are PLACEHOLDER values in production — refusing to report ready ' +
        '(§8.2 guard 2). Until C9 replaces them with measured values, no mood output may be ' +
        'presented as a measured result.',
    };
  }
  return { ready: true };
}
