/**
 * C0.10 artifact generator (BACKEND_IMPLEMENTATION_PLAN.md §3A.5, C3B_PLAN.md §8,
 * deviations D-17 / D-19).
 *
 * Produces: the distribution of the AVERAGED-ARGMAX `confidence` (the quantity
 * C3B feeds fusion, replacing single-frame confidence) against VALID FRAME
 * COUNT — resampled with replacement from the 19 real C0 FER fixtures.
 *
 * ⛔ LABELLING — all mandatory, and repeated in the output file:
 *  - a CHARACTERISATION OF THE AGGREGATION, from real FER responses to
 *    SYNTHETIC images, resampled. NOT live user video. NOT a scientific result.
 *  - ⛔ NOT a proposed value for `tau_face_min`. It proposes nothing.
 *  - ⛔ NO averaged-FER accuracy figure appears — none exists; the test split
 *    is spent.
 *  - ⛔ the averaged confidence is reported AS-IS — never rescaled or
 *    "corrected" to resemble single-frame confidence.
 *
 * Run:  npx tsx test/integration/c0_10_gen.mts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FrameAccumulator } from '../../src/capture/frameAccumulator.js';
import { computeTurnFaceEvidence } from '../../src/capture/turnFaceEvidence.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');
const OUT = join(HERE, 'C0_10_AVERAGED_CONFIDENCE.md');

interface FerFixture {
  model_version: string;
  probabilities: Record<string, number>;
  predicted_class: string;
  confidence: number;
}

const fixtures: FerFixture[] = readdirSync(FIXTURES)
  .filter((f) => /^fer_(face|noise|flat|gradient)_.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as FerFixture);

if (fixtures.length !== 19) throw new Error(`expected 19 valid fixtures, found ${fixtures.length}`);

// deterministic PRNG so the artifact is reproducible
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260830);

const FRAME_COUNTS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
const REPEATS = 3000;

function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

interface Row {
  n: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
  meanArgmaxStateCounts: Record<string, number>;
}

const rows: Row[] = [];
for (const n of FRAME_COUNTS) {
  const confs: number[] = [];
  const stateCounts: Record<string, number> = { calm: 0, neutral: 0, distressed: 0 };
  for (let r = 0; r < REPEATS; r++) {
    const acc = new FrameAccumulator(0);
    for (let i = 0; i < n; i++) {
      const fx = fixtures[Math.floor(rand() * fixtures.length)]!;
      acc.addFrame(fx.probabilities, fx.model_version, i);
    }
    const turn = computeTurnFaceEvidence(acc.snapshot(), 0);
    if (!turn.evidence) throw new Error('unexpected null evidence');
    confs.push(turn.evidence.confidence);
    stateCounts[turn.evidence.predicted_state] = (stateCounts[turn.evidence.predicted_state] ?? 0) + 1;
  }
  confs.sort((a, b) => a - b);
  rows.push({
    n,
    min: confs[0]!,
    p10: percentile(confs, 0.1),
    p50: percentile(confs, 0.5),
    p90: percentile(confs, 0.9),
    max: confs[confs.length - 1]!,
    meanArgmaxStateCounts: stateCounts,
  });
}

const fmt = (x: number): string => x.toFixed(4);

const singleFrameConf = fixtures.map((f) => f.confidence).sort((a, b) => a - b);
const sfMin = singleFrameConf[0]!;
const sfMed = percentile(singleFrameConf, 0.5);
const sfMax = singleFrameConf[singleFrameConf.length - 1]!;

const md = `# C0.10 — averaged \`confidence\` vs valid frame count

**Produced by:** Phase C3B, \`test/integration/c0_10_gen.mts\` · **Date:** 2026-08-30
**Deviations:** D-17 (synthesised sequences, not live capture), D-19 (C3B produces the
artifact the plan assigns to C8.3; C8.3's own measurement still stands).

---

## ⛔ What this is — and is not

- A **characterisation of the aggregation**: it measures how the argmax probability of the
  **mean** 7-vector behaves as the number of averaged frames grows. C3B changes the
  \`confidence\` handed to fusion from *single-frame argmax* to *argmax of the mean vector*;
  averaging pulls a distribution toward its centre, so the value is **systematically lower**.
- Built from **real FER \`/predict\` responses to SYNTHETIC images** (the 19 valid C0 fixtures),
  **resampled with replacement**. It is **not** live user video and **not** a scientific result.
- ⛔ **NOT a proposed value for \`tau_face_min\`.** C3B proposes nothing. \`tau_face_min\` is a
  \`[FUTURE-EXPERIMENTAL]\` symbol set by the Phase 7 experiment.
- ⛔ **No averaged-FER accuracy figure appears.** None exists — the FER-2013 test split is
  spent and the gap cannot be closed (§3A.7).
- ⛔ The averaged confidence is reported **as-is**. It is **not** rescaled or "corrected" to
  resemble single-frame confidence — that would invent a transformation nobody measured.

## Why it matters (§3A.5 / §8.2)

\`tau_face_min\` gates on this value, and C4 **observed** that gate live (it dropped a face at
confidence 0.25). If Phase 7 calibrates \`tau_face_min\` against **single-frame** confidences
while production feeds it **averaged** confidences, the threshold is calibrated against the
wrong distribution — and the failure is silent, because the number still looks plausible.
The honest handling: report the averaged confidence as-is and derive the threshold from the
**same** quantity. This artifact is the first evidence toward that, produced early because
Phase 7 may run before C8.3.

---

## Method

- **Source:** 19 valid C0 FER fixtures (\`fer_{face,noise,flat,gradient}_*\`), real service
  responses, verbatim probabilities.
- For each target frame count \`N\`, draw \`N\` fixtures uniformly **with replacement**, feed
  their probability vectors through the C3B \`FrameAccumulator\`, then through
  \`computeTurnFaceEvidence\` (mean → derived argmax → **unchanged C3 adapter**).
- Record \`evidence.confidence\` = the mean vector's argmax probability.
- **${REPEATS} independent resampled sequences per \`N\`.** Deterministic PRNG (seed 20260830) —
  the table is reproducible.

**Single-frame \`confidence\` across the same 19 fixtures, for contrast only:**
min ${fmt(sfMin)} · median ${fmt(sfMed)} · max ${fmt(sfMax)}
(nb05 measured mean single-frame confidence at 0.929 on a different, larger corpus.)

---

## Result — averaged-argmax \`confidence\` distribution

| valid frames | min | p10 | median | p90 | max | mean-vector argmax state mix (calm / neutral / distressed) |
|---:|---:|---:|---:|---:|---:|---|
${rows
  .map(
    (r) =>
      `| ${r.n} | ${fmt(r.min)} | ${fmt(r.p10)} | ${fmt(r.p50)} | ${fmt(r.p90)} | ${fmt(r.max)} | ${r.meanArgmaxStateCounts.calm} / ${r.meanArgmaxStateCounts.neutral} / ${r.meanArgmaxStateCounts.distressed} |`,
  )
  .join('\n')}

### Reading it

- At **1 frame** the distribution is exactly the single-frame fixture confidences (resampled).
- As \`N\` grows the spread **collapses toward the corpus centroid's argmax probability** — the
  min/max band narrows and the median settles. This is the averaging effect §3A.5 describes,
  quantified on this corpus.
- The state-mix column shows which state the mean vector's argmax lands on; it is **not** an
  accuracy measure and must not be read as one (the fixtures are synthetic images).

⛔ **Hand this table to the Phase 7 / \`tau_face_min\` work as the "averaged" distribution.**
It replaces the single-frame assumption; it does not name a threshold.
`;

writeFileSync(OUT, md);
// eslint-disable-next-line no-console
console.log(`wrote ${OUT}`);
for (const r of rows) {
  // eslint-disable-next-line no-console
  console.log(`N=${r.n}\tmin=${fmt(r.min)}\tp50=${fmt(r.p50)}\tmax=${fmt(r.max)}`);
}
