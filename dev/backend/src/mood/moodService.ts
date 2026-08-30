/**
 * ★ C6 — mood orchestration (BACKEND_IMPLEMENTATION_PLAN.md §6.5, §8.2, §9.5,
 * §10, §10.1, §3A.10.1, §5.5.1; C6_PLAN.md §2–§6).
 *
 * This is the seam, not the parts. Every value below was already built by an
 * earlier phase — face evidence by C3/C3B's `computeTurnFaceEvidence`, text
 * evidence by C3/C5's adapter and language modules, fusion by C4's wrapper.
 * This file's only job is to call each of them in the right order and pass
 * fusion's own §A7 object through unchanged.
 *
 * ⛔ TRAP 1 (C6_PLAN.md §2) — fusion is NEVER bypassed. Camera off, English
 * text, and a degraded sentiment call all still call `fusionClient.fuse()` —
 * with `null` standing in for the unavailable side. There is exactly one
 * `fuse()` call site below and every code path in this file reaches it.
 *
 * ⛔ TRAP 2 (§3, §6.5) — a modality failure is NOT a request failure. FER's
 * failure modes are already absorbed upstream, in the per-frame ingest route
 * (C3B): a failed frame simply contributes nothing to the accumulator, so
 * "FER is down" and "the camera is off" are the SAME state by the time this
 * file runs — zero frames, face evidence `null`. This file therefore never
 * calls the FER client at all; §6.5's FER-503 row is enforced structurally by
 * C3B's frame route (a 503 there degrades that one frame, it does not fail
 * the session), and is NOT re-implemented here. See C6 report deviation D-33.
 *
 * The sentiment call IS made here, synchronously, so its 503 asymmetry must
 * be handled here: a 503 (or a circuit that most recently tripped on a 503)
 * propagates as 503 to the caller, circuit already opened by the client
 * layer, no retry. Any OTHER sentiment failure (timeout, connection error,
 * a non-503 5xx) degrades to face-only, 200 — §6.5's ordinary case.
 *
 * ⛔ TRAP 3 (§4) — `modalities_used`, `state`, `confidence`, `fusion_version`
 * are fusion's own §A7 object, copied onto the response verbatim. Nothing
 * here recomputes, infers, or "corrects" them from what was attempted.
 *
 * ⛔ §10.1 — no accuracy/reliability figure, no per-frame mood, no
 * `safety_state`, ever, anywhere in the assembled response.
 *
 * ⛔ Message text is never logged (§9.5) — this file logs session ids, frame
 * counts, language classifications, and error codes only.
 */
import type { SessionStore } from '../capture/sessionStore.js';
import { computeTurnFaceEvidence } from '../capture/turnFaceEvidence.js';
import type { SentimentClient } from '../clients/sentiment.client.js';
import type { FusionClient } from '../clients/fusion.client.js';
import { detectLanguage, type LanguageBounds } from '../language/detect.js';
import { routeLanguage, type LanguagePolicy } from '../language/policy.js';
import { buildTextEvidence, TextArgmaxDivergenceError, type TextEvidence } from '../evidence/textEvidence.js';
import type { FaceEvidence } from '../evidence/faceEvidence.js';
import { logger } from '../logging/logger.js';

export interface MoodAnalyseResponseBody {
  state: 'calm' | 'neutral' | 'distressed' | 'unknown';
  confidence: number;
  modalities_used: string[];
  fusion_version: string;
  language_detected: string;
  text_evidence_dropped: boolean;
  face_frame_count: number;
  session_elapsed_ms: number;
  model_versions: { face: string | null; text: string | null };
  /** §8.2 guard 3 — present ONLY in non-production, sourced live from fusion's
   *  own GET /health so it can never drift from the parameters actually in
   *  use. Absent (not merely falsy) in production. */
  parameters_provenance?: string;
}

export type AnalyseMoodOutcome =
  | { kind: 'ok'; body: MoodAnalyseResponseBody }
  | { kind: 'rejected'; httpStatus: number; code: string; message: string }
  /** ⛔ TRAP 2 (§3) — the ONLY 503 this endpoint ever returns: the sentiment
   *  service itself returned 503 (or the circuit is open because it most
   *  recently did). Never retried; the circuit is already open by the time
   *  this is returned. */
  | { kind: 'upstream_unavailable'; httpStatus: 503; code: string; message: string };

export interface MoodServiceDeps {
  sessionStore: Pick<SessionStore, 'get'>;
  sentimentClient: Pick<SentimentClient, 'predict'>;
  fusionClient: Pick<FusionClient, 'fuse' | 'health'>;
  languageBounds: LanguageBounds;
  languagePolicy: LanguagePolicy;
  /** `env.NODE_ENV` — governs guard 3 (§8.2) only; never a fusion parameter. */
  nodeEnv: string;
}

export interface AnalyseMoodInput {
  /** ⛔ The face side is read from the accumulator keyed by this id — it is
   *  NEVER accepted from the request body (§ Part A). Absent/no session is
   *  normal operation (consent never granted) and degrades to text-only,
   *  exactly like zero accumulated frames. */
  sessionId: string | undefined;
  text: string;
  correlationId?: string | undefined;
}

const PLACEHOLDER_PROVENANCE_UNAVAILABLE = 'PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE (fusion health check unavailable — provenance could not be confirmed live)';

export async function analyseMood(
  input: AnalyseMoodInput,
  deps: MoodServiceDeps,
  now: number = Date.now(),
): Promise<AnalyseMoodOutcome> {
  // ── Part A step 1 — face evidence from the session accumulator, NEVER the request body ──
  const session = input.sessionId ? deps.sessionStore.get(input.sessionId) : undefined;
  const turnFace = session
    ? computeTurnFaceEvidence(session.accumulator.snapshot(), now)
    : { evidence: null as FaceEvidence | null, frameCount: 0, sessionElapsedMs: 0 };

  // ── Part A step 2 — language detection, BEFORE any sentiment call ──
  const detection = detectLanguage(input.text, deps.languageBounds);
  const route = routeLanguage(detection.classification, deps.languagePolicy);

  if (route.route === 'reject') {
    // A deliberate, visible failure (§5.5A) — not a degraded mood result, and
    // fusion is not invoked: there is no evidence pair to fuse, only a
    // request the configured policy refuses to service.
    return {
      kind: 'rejected',
      httpStatus: 400,
      code: 'text_language_rejected',
      message: 'This message could not be classified as Sinhala text; LANGUAGE_POLICY=reject requires Sinhala input.',
    };
  }

  let textEvidence: TextEvidence | null = null;
  const languageDetected: string = route.languageDetected;

  if (route.route === 'sentiment') {
    // ⛔ Non-Sinhala never reaches this branch — routeLanguage() only returns
    // 'sentiment' for classification 'si' (Part A step 2).
    const outcome = await deps.sentimentClient.predict(input.text, input.correlationId);

    if (outcome.kind === 'success') {
      try {
        textEvidence = buildTextEvidence({
          evidence: outcome.data.evidence,
          predictedLabel: outcome.data.predicted_label,
          confidence: outcome.data.confidence,
          modelVersion: outcome.data.model_version,
          language: languageDetected,
        });
      } catch (err) {
        if (err instanceof TextArgmaxDivergenceError) {
          // The sentiment service's own output is internally inconsistent —
          // a service defect, not a caller fault. Degrade to face-only
          // rather than fail the request; never log the message text.
          logger.error(
            { code: 'text_evidence_argmax_divergence', predictedState: err.predictedState, expectedState: err.expectedState },
            'sentiment service predicted_label disagrees with argmax(evidence) — degrading to face-only',
          );
          textEvidence = null;
        } else {
          throw err;
        }
      }
    } else if (outcome.kind === 'rejected') {
      // The sentiment service rejected the text itself (missing/empty) —
      // unreachable in practice because detectLanguage() already routes a
      // zero-letter message to 'other' -> face_only before sentiment is ever
      // called. Defensive: treat as text-unavailable rather than a 400,
      // since the caller's `text` field was already accepted upstream.
      logger.warn({ code: outcome.code }, 'sentiment service rejected text unexpectedly; degrading to face-only');
      textEvidence = null;
    } else {
      // outcome.kind === 'unavailable'
      // ⛔ TRAP 2 — the ONLY case that propagates as a request failure: an
      // observed 503 (or a circuit still open from one). Everything else
      // (timeout, connection_error, a non-503 5xx) degrades to face-only, 200.
      if (outcome.upstreamStatus === 503) {
        return {
          kind: 'upstream_unavailable',
          httpStatus: 503,
          code: outcome.code,
          message: 'The sentiment service is unavailable (deployment fault) — not retried.',
        };
      }
      logger.warn({ reason: outcome.reason, code: outcome.code }, 'sentiment call degraded; text evidence unavailable');
      textEvidence = null;
    }
  }

  const textEvidenceDropped = textEvidence === null;

  // ── Part A step 4 — invoke fusion. ALWAYS. Every path above funnels here. ──
  const fuseOutcome = await deps.fusionClient.fuse(
    {
      faceEvidence: turnFace.evidence as unknown as Record<string, unknown> | null,
      textEvidence: textEvidence as unknown as Record<string, unknown> | null,
    },
    input.correlationId,
  );

  if (fuseOutcome.kind !== 'success') {
    // Fusion never returns a 503 (none of its error codes map to one) and
    // never returns `rejected` (every fusion code maps to `unavailable`) —
    // reaching here means either the fusion service is down or our own
    // evidence was malformed. Either way this is a backend-side failure, not
    // a legitimate degraded mood state, and is surfaced as 502.
    const code = fuseOutcome.kind === 'unavailable' ? fuseOutcome.code : 'fusion_unavailable';
    logger.error({ code }, 'fusion call failed — mood cannot be determined');
    return {
      kind: 'rejected',
      httpStatus: 502,
      code,
      message: 'The fusion service is unavailable.',
    };
  }

  // ── Part B — assemble the response. §A7 keys pass through UNCHANGED. ──
  const body: MoodAnalyseResponseBody = {
    state: fuseOutcome.data.state,
    confidence: fuseOutcome.data.confidence,
    modalities_used: fuseOutcome.data.modalities_used,
    fusion_version: fuseOutcome.data.fusion_version,
    language_detected: languageDetected,
    text_evidence_dropped: textEvidenceDropped,
    face_frame_count: turnFace.frameCount,
    session_elapsed_ms: turnFace.sessionElapsedMs,
    model_versions: {
      face: turnFace.evidence?.model_version ?? null,
      text: textEvidence?.model_version ?? null,
    },
  };

  // ⛔ §8.2 guard 3 — non-production only, sourced LIVE from fusion's own
  // GET /health so it can never drift from the parameters actually in use.
  if (deps.nodeEnv !== 'production') {
    const health = await deps.fusionClient.health(input.correlationId);
    body.parameters_provenance = health.ok ? health.data.parameters_provenance : PLACEHOLDER_PROVENANCE_UNAVAILABLE;
  }

  return { kind: 'ok', body };
}
