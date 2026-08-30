/**
 * ★ C7 Part D (D-32) — the full multi-upstream `/ready` handshake C4
 * deferred. Verifies all THREE upstreams respond and each reports its pinned
 * artifact identity (`verifyContract()`, already built per-client in C2/C5),
 * plus the §8.2 placeholder handshake (`checkFusionReadiness`, built in C4 —
 * reused here unchanged, not reimplemented).
 *
 * ⛔ Reporting only that the Node process is alive is not readiness — that is
 * `/health` (liveness). This module backs `/ready` only.
 */
import type { FerClient } from '../clients/fer.client.js';
import type { SentimentClient } from '../clients/sentiment.client.js';
import type { FusionClient } from '../clients/fusion.client.js';
import { checkFusionReadiness } from './fusionReadiness.js';
import { FER_CONTRACT, SENTIMENT_CONTRACT, FUSION_CONTRACT } from '../clients/types.js';
import type { DeploymentPosture } from '../config/env.js';

export interface UpstreamCheck {
  ready: boolean;
  artifactIdentity?: string | undefined;
  reason?: string | undefined;
}

export interface ReadinessResult {
  ready: boolean;
  posture: DeploymentPosture;
  /** Present (and meaningful) only when the fusion upstream itself responded. */
  parametersArePlaceholder?: boolean | undefined;
  checks: {
    fer: UpstreamCheck;
    sentiment: UpstreamCheck;
    fusion: UpstreamCheck;
  };
}

export interface ReadinessDeps {
  ferClient: Pick<FerClient, 'verifyContract'>;
  sentimentClient: Pick<SentimentClient, 'verifyContract'>;
  fusionClient: Pick<FusionClient, 'verifyContract' | 'health'>;
  /** ★ Follow-up packet 3 / D-42 — reads DEPLOYMENT_POSTURE, not NODE_ENV. */
  posture: DeploymentPosture;
}

export async function checkReadiness(deps: ReadinessDeps): Promise<ReadinessResult> {
  const [ferResult, sentimentResult, fusionContractResult, fusionPlaceholderResult] = await Promise.all([
    deps.ferClient.verifyContract(),
    deps.sentimentClient.verifyContract(),
    deps.fusionClient.verifyContract(),
    checkFusionReadiness(deps.fusionClient, deps.posture),
  ]);

  const fer: UpstreamCheck = ferResult.ok
    ? { ready: true, artifactIdentity: FER_CONTRACT.modelVersion }
    : { ready: false, reason: ferResult.reason };

  const sentiment: UpstreamCheck = sentimentResult.ok
    ? { ready: true, artifactIdentity: SENTIMENT_CONTRACT.modelVersion }
    : { ready: false, reason: sentimentResult.reason };

  // Fusion is ready only if BOTH its contract handshake AND the §8.2
  // placeholder guard pass — a placeholder in production must still refuse
  // readiness even if the contract itself matches.
  const fusion: UpstreamCheck =
    fusionContractResult.ok && fusionPlaceholderResult.ready
      ? { ready: true, artifactIdentity: FUSION_CONTRACT.fusionVersion }
      : {
          ready: false,
          reason: !fusionContractResult.ok ? fusionContractResult.reason : fusionPlaceholderResult.reason,
        };

  return {
    ready: fer.ready && sentiment.ready && fusion.ready,
    posture: deps.posture,
    parametersArePlaceholder: fusionPlaceholderResult.parametersArePlaceholder,
    checks: { fer, sentiment, fusion },
  };
}
