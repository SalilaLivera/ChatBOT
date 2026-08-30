/**
 * C5 — integration proof, driven directly against the live fusion service
 * (docker compose, per C4_DONE.md) and a counting fake for sentiment.
 *
 * ⛔ D-25 (C5_PLAN.md §10): /mood/analyse is C6's route and does not exist
 * yet. These assertions are proved by calling the C4 FusionClient directly
 * with C5's routing decision — exactly the approach C5_PLAN.md §7 specifies
 * for proving "fusion still runs" and "English + camera off → unknown"
 * without building the route.
 *
 * The orchestration below (detect → route → maybe-call-sentiment → always
 * call fusion) is test-local, standing in for what C6 will wire for real. It
 * is not exported from src/ — C5 builds only the detector, the policy, and
 * the bounds proposal.
 */
import { describe, expect, it } from 'vitest';
import { UpstreamHttpClient } from '../../src/clients/httpClient.js';
import { FusionClient } from '../../src/clients/fusion.client.js';
import { SentimentClient } from '../../src/clients/sentiment.client.js';
import { buildFaceEvidence } from '../../src/evidence/faceEvidence.js';
import { buildTextEvidence } from '../../src/evidence/textEvidence.js';
import { detectLanguage, type LanguageBounds } from '../../src/language/detect.js';
import { routeLanguage } from '../../src/language/policy.js';
import { FakePool, asPool } from '../unit/clients/fakePool.js';

const BOUNDS: LanguageBounds = { siRatioHigh: 0.6, siRatioLow: 0.1 };
const FUSION_URL = process.env.FUSION_SERVICE_URL ?? 'http://localhost:9000';

const SAMPLE_FACE_PROBS = {
  angry: 0.02,
  disgust: 0.01,
  fear: 0.02,
  happy: 0.85,
  neutral: 0.06,
  sad: 0.02,
  surprise: 0.02,
};

/**
 * Stand-in for the C6 orchestration: detect → route → (maybe) sentiment →
 * always fusion. Returns everything a test needs to assert on, including
 * the exact bytes that would have been sent to the sentiment client.
 */
async function runTurn(opts: {
  text: string | null;
  cameraOn: boolean;
  fusionClient: FusionClient;
  sentimentClient: SentimentClient;
  callLog: string[];
}) {
  const { text, cameraOn, fusionClient, sentimentClient, callLog } = opts;

  let textEvidence: Record<string, unknown> | null = null;
  let languageDetected: string | null = null;
  let textEvidenceDropped = false;

  if (text !== null) {
    const detection = detectLanguage(text, BOUNDS);
    callLog.push('detect'); // detection runs before any sentiment call
    const decision = routeLanguage(detection.classification, 'face_only');
    languageDetected = decision.languageDetected;

    if (decision.route === 'sentiment') {
      callLog.push('sentiment_call');
      const outcome = await sentimentClient.predict(text);
      if (outcome.kind === 'success') {
        textEvidence = buildTextEvidence({
          evidence: outcome.data.evidence,
          predictedLabel: outcome.data.predicted_label,
          confidence: outcome.data.confidence,
          modelVersion: outcome.data.model_version,
          language: decision.languageDetected,
        }) as unknown as Record<string, unknown>;
      }
    } else {
      textEvidenceDropped = true;
    }
  }

  const faceEvidence = cameraOn
    ? (buildFaceEvidence({
        probabilities: SAMPLE_FACE_PROBS,
        predictedClass: 'happy',
        confidence: 0.85,
        modelVersion: 'fer-mobilenetv2-96-float32/1.0.0',
      }) as unknown as Record<string, unknown>)
    : null;

  callLog.push('fusion_call'); // fusion is NEVER bypassed, even face-only/neither
  const fusionResult = await fusionClient.fuse({ faceEvidence, textEvidence });

  return { fusionResult, languageDetected, textEvidenceDropped };
}

function makeFusionClient(): FusionClient {
  return new FusionClient(new UpstreamHttpClient({ baseUrl: FUSION_URL, timeoutMs: 5000 }));
}

describe('C5 integration — language routing against the live fusion service', () => {
  it('⛔ English: sentiment is NOT called (zero calls); fusion still runs; face-only result', async () => {
    const sentimentPool = new FakePool([]);
    const sentimentClient = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(sentimentPool) }),
    );
    const callLog: string[] = [];

    const { fusionResult, languageDetected, textEvidenceDropped } = await runTurn({
      text: 'I feel very anxious about the appointment today.',
      cameraOn: true,
      fusionClient: makeFusionClient(),
      sentimentClient,
      callLog,
    });

    // ⛔ zero sentiment calls — the counting stub
    expect(sentimentPool.callCount).toBe(0);
    expect(textEvidenceDropped).toBe(true);
    expect(languageDetected).not.toBe('si');

    // detection ran before any sentiment call attempt would have happened,
    // and fusion still ran despite text being dropped
    expect(callLog).toEqual(['detect', 'fusion_call']);

    expect(fusionResult.kind).toBe('success');
    if (fusionResult.kind === 'success') {
      // §A6 row-3 — face passthrough, Rule-A label; ⛔ fusion is not bypassed
      expect(fusionResult.data.modalities_used).toEqual(['face']);
      expect(Object.keys(fusionResult.data).sort()).toEqual(
        ['confidence', 'fusion_version', 'modalities_used', 'state'].sort(),
      );
    }
  });

  it('⛔ English + camera off → unknown, HTTP-success shape, first-class state', async () => {
    const sentimentPool = new FakePool([]);
    const sentimentClient = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(sentimentPool) }),
    );
    const callLog: string[] = [];

    const { fusionResult } = await runTurn({
      text: 'I feel very anxious about the appointment today.',
      cameraOn: false,
      fusionClient: makeFusionClient(),
      sentimentClient,
      callLog,
    });

    expect(sentimentPool.callCount).toBe(0);
    expect(fusionResult.kind).toBe('success');
    if (fusionResult.kind === 'success') {
      expect(fusionResult.data.state).toBe('unknown');
      expect(fusionResult.data.modalities_used).toEqual([]);
    }
  });

  it('romanised Sinhala (Singlish) → non-Sinhala → face-only, sentiment NOT called (§6)', async () => {
    const sentimentPool = new FakePool([]);
    const sentimentClient = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(sentimentPool) }),
    );
    const callLog: string[] = [];

    const { textEvidenceDropped, languageDetected } = await runTurn({
      text: 'mama gedara yanawa, mata harima duk hithenawa',
      cameraOn: true,
      fusionClient: makeFusionClient(),
      sentimentClient,
      callLog,
    });

    expect(sentimentPool.callCount).toBe(0);
    expect(textEvidenceDropped).toBe(true);
    expect(languageDetected).not.toBe('si');
  });

  it('⛔ native Sinhala: sentiment IS called; the text sent is byte-identical to the input (TRAP 1)', async () => {
    const original = 'මට අද හරිම බයයි.';
    const sentimentBody = JSON.stringify({
      model_version: 'sinbert_small_maternalink_mood_exp02/0.1.0',
      checkpoint_sha256: 'x',
      label_order: ['CALM', 'NEUTRAL', 'DISTRESSED'],
      probabilities: { CALM: 0.1, NEUTRAL: 0.1, DISTRESSED: 0.8 },
      evidence: { calm: 0.1, neutral: 0.1, distressed: 0.8 },
      predicted_label: 'DISTRESSED',
      predicted_label_id: 2,
      confidence: 0.8,
      label_space: 'mood3',
      supported_language: 'si',
    });
    const sentimentPool = new FakePool([{ type: 'response', status: 200, text: sentimentBody }]);
    const sentimentClient = new SentimentClient(
      new UpstreamHttpClient({ baseUrl: 'http://sentiment', timeoutMs: 1000, pool: asPool(sentimentPool) }),
    );
    const callLog: string[] = [];

    const { languageDetected, textEvidenceDropped } = await runTurn({
      text: original,
      cameraOn: false,
      fusionClient: makeFusionClient(),
      sentimentClient,
      callLog,
    });

    expect(languageDetected).toBe('si');
    expect(textEvidenceDropped).toBe(false);
    expect(sentimentPool.callCount).toBe(1);
    expect(callLog).toEqual(['detect', 'sentiment_call', 'fusion_call']); // detection before sentiment call

    // ⛔ TRAP 1 proof: the exact bytes sent to /predict decode back to the
    // untouched original string — no stripping, no case-folding, no
    // normalisation applied to the message that leaves the process.
    const sentBody = sentimentPool.calls[0]?.body as string;
    const parsedSent = JSON.parse(sentBody) as { text: string };
    expect(parsedSent.text).toBe(original);
    expect(Buffer.from(parsedSent.text, 'utf8').equals(Buffer.from(original, 'utf8'))).toBe(true);
  });
});
