// One-off generator for T-A9 — NOT part of the application. Builds sample
// face/text evidence via the real adapters and writes them to disk so a
// scratch Python container can validate them against fusion's own
// validate_modality_evidence() (dev/fusion is imported read-only, C3_PLAN §7).
import { writeFileSync } from 'node:fs';
import { buildFaceEvidence } from '../../src/evidence/faceEvidence.js';
import { buildTextEvidence } from '../../src/evidence/textEvidence.js';

const face = buildFaceEvidence({
  probabilities: {
    angry: 0.2,
    disgust: 0.05,
    fear: 0.15,
    happy: 0.25,
    neutral: 0.2,
    sad: 0.1,
    surprise: 0.05,
  },
  predictedClass: 'happy',
  confidence: 0.25,
  modelVersion: 'fer-mobilenetv2-96-float32/1.0.0',
});

const text = buildTextEvidence({
  evidence: { calm: 0.1, neutral: 0.2, distressed: 0.7 },
  predictedLabel: 'DISTRESSED',
  confidence: 0.7,
  modelVersion: 'sinbert_small_maternalink_mood_exp02/0.1.0',
  language: 'si',
});

writeFileSync(new URL('./_ta9_face.json', import.meta.url), JSON.stringify(face));
writeFileSync(new URL('./_ta9_text.json', import.meta.url), JSON.stringify(text));
console.log('face:', JSON.stringify(face));
console.log('text:', JSON.stringify(text));
