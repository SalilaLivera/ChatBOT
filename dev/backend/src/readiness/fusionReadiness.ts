/**
 * §8.2 guard 2 — the readiness handshake. The Node backend calls fusion's
 * GET /health and refuses to report ready if `parameters_are_placeholder` is
 * true under the `strict` deployment posture. Built now (C4), even though
 * full orchestration is C6 — this specific guard is explicitly C4's to build
 * (C4_PLAN.md §3.3: "C4 builds 1, 2 and 4. Guard 3 lands with the mood
 * response in C6.").
 *
 * ★ Follow-up packet 3, step 4 (D-42) — this guard reads DEPLOYMENT_POSTURE,
 * NOT NODE_ENV. NODE_ENV stays a pure Node runtime posture and continues to
 * arm every other production guard unconditionally; conflating the two is
 * exactly what made a demo deployment impossible before this change. See
 * C7_DECISIONS_AND_GAPS.md D-42.
 *
 * ⛔ This module changes no fusion parameter value, no
 * `FUSION_PARAM_PROVENANCE` string, and no `parameters_are_placeholder`
 * computation — that flag remains a substring check on the provenance string
 * in `dev/fusion-service/fusion_service/params.py`, entirely outside this
 * repo's control. `research_demo` only changes what THIS backend does when
 * the flag is true; it never changes the flag itself.
 */
import type { FusionClient } from '../clients/fusion.client.js';
import type { DeploymentPosture } from '../config/env.js';

export interface FusionReadinessResult {
  ready: boolean;
  reason?: string;
  /** Present (and meaningful) only when the fusion health check itself succeeded. */
  parametersArePlaceholder?: boolean | undefined;
}

export async function checkFusionReadiness(
  client: Pick<FusionClient, 'health'>,
  posture: DeploymentPosture,
): Promise<FusionReadinessResult> {
  const health = await client.health();
  if (!health.ok) {
    // ⛔ A broken/unreachable upstream is never excused by posture — only a
    // placeholder-parameters finding on an otherwise-healthy fusion is.
    return { ready: false, reason: `fusion health check failed: ${health.reason}` };
  }

  const parametersArePlaceholder = health.data.parameters_are_placeholder;

  if (posture === 'strict' && parametersArePlaceholder) {
    return {
      ready: false,
      parametersArePlaceholder: true,
      reason:
        'fusion parameters are PLACEHOLDER values under the `strict` deployment posture — ' +
        'refusing to report ready (§8.2 guard 2). Until C9 replaces them with measured values, ' +
        'no mood output may be presented as a measured result.',
    };
  }

  return { ready: true, parametersArePlaceholder };
}
