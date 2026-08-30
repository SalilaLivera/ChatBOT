/**
 * C0.10 artifact generator (BACKEND_IMPLEMENTATION_PLAN.md §3A.5, C3B_PLAN.md §8,
 * deviations D-17 / D-19). Regenerated per `ML_RULINGS_2_RECEIVED.md` §3
 * (backend follow-up packet 1, Task 2): N-grid concentrated where real
 * sessions live (§3.1), an operating-characteristic / rejection-rate table
 * added (§3.2), and a third limit — effective-sample-size / i.i.d. optimism
 * — carried alongside the first two (`ML_INPUT_3_CAPTURE_CONSTRAINTS.md` §2).
 *
 * Produces: the distribution of the AVERAGED-ARGMAX `confidence` (the quantity
 * C3B feeds fusion, replacing single-frame confidence) against VALID FRAME
 * COUNT — resampled with replacement from the 19 real C0 FER fixtures.
 *
 * ⛔ LABELLING — all mandatory, and repeated in the output file:
 *  - a CHARACTERISATION OF THE AGGREGATION, from real FER responses to
 *    SYNTHETIC images, resampled. NOT live user video. NOT a scientific result.
 *  - ⛔ NOT a proposed value for `tau_face_min`. It proposes nothing — the
 *    operating-characteristic table is a CURVE, not a value; no row/cell is
 *    marked recommended, bolded as preferred, or called suitable.
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
const RAW_OUT = join(HERE, 'C0_10_RAW_SEQUENCES.json');

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

// §3.1 — dense grid over N=1..100 (every N to 20, then steps of 10), with
// only a few high-N rows kept to show the convergence trend. This
// concentrates resolution where real sessions live: at 5 fps, a realistic
// turn is ~1-20s of continuous capture, i.e. N ≈ 5-100. It is also, per the
// ML track, the range where the resampling artefact (limit B below) is
// weakest — so the regrid improves the artifact on both counts.
const DENSE_LOW = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
const MID = [30, 40, 50, 60, 70, 75, 80, 90, 100];
const HIGH_TREND = [250, 500, 1000];
const FRAME_COUNTS = [...DENSE_LOW, ...MID, ...HIGH_TREND];

// §3.2 — operating-characteristic thresholds. A CURVE, not a value: no
// threshold below is proposed, recommended, or preferred.
const THRESHOLDS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];

// The operating-characteristic table uses a subset of the N grid — the full
// 31-column grid renders as an unreadable wall in Markdown. Subset chosen to
// keep the low-N density (where real sessions live) and a thinned tail.
const OC_N_SUBSET = [1, 2, 5, 10, 15, 20, 30, 50, 75, 100, 250, 500, 1000];

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
  confs: number[];
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
    confs,
  });
}

// §3.2 — rejection rate = fraction of sequences at N whose averaged
// confidence falls BELOW threshold t. Pure lookup; no recommendation.
const rowsByN = new Map(rows.map((r) => [r.n, r]));
const ocTable: { t: number; rates: Map<number, number> }[] = THRESHOLDS.map((t) => {
  const rates = new Map<number, number>();
  for (const n of OC_N_SUBSET) {
    const r = rowsByN.get(n);
    if (!r) continue;
    const belowCount = r.confs.filter((c) => c < t).length;
    rates.set(n, belowCount / r.confs.length);
  }
  return { t, rates };
});

const fmt = (x: number): string => x.toFixed(4);
const fmtPct = (x: number): string => (x * 100).toFixed(1) + '%';

const singleFrameConf = fixtures.map((f) => f.confidence).sort((a, b) => a - b);
const sfMin = singleFrameConf[0]!;
const sfMed = percentile(singleFrameConf, 0.5);
const sfMax = singleFrameConf[singleFrameConf.length - 1]!;

// Raw sequences retained on disk (cheap: 3000 * 31 ≈ 93,000 floats) so the
// artifact's numbers are reproducible/auditable without re-running the
// generator. See "Raw sequences" section of the Markdown output for the path.
writeFileSync(
  RAW_OUT,
  JSON.stringify(
    {
      seed: 20260830,
      repeatsPerN: REPEATS,
      generatedAt: '2026-08-30',
      sequences: rows.map((r) => ({ n: r.n, confidences: r.confs })),
    },
    null,
    0,
  ),
);

const md = `# C0.10 — averaged \`confidence\` vs valid frame count

**Produced by:** Phase C3B, regenerated in follow-up packet 1 (Task 2),
\`test/integration/c0_10_gen.mts\` · **Date:** 2026-08-30
**Deviations:** D-17 (synthesised sequences, not live capture), D-19 (C3B produces the
artifact the plan assigns to C8.3; C8.3's own measurement still stands).
**Revision:** per \`ML_RULINGS_2_RECEIVED.md\` §3 — N-grid concentrated at N=1-100 (§3.1) and
an operating-characteristic / rejection-rate table added (§3.2). Both stated limits from the
prior version are carried unchanged, and a third limit (effective sample size /
i.i.d.-optimism) is added per \`ML_INPUT_3_CAPTURE_CONSTRAINTS.md\` §2.

---

## ⛔ What this is — and is not

- A **characterisation of the aggregation**: it measures how the argmax probability of the
  **mean** 7-vector behaves as the number of averaged frames grows. C3B changes the
  \`confidence\` handed to fusion from *single-frame argmax* to *argmax of the mean vector*;
  averaging pulls a distribution toward its centre, so the value is **systematically lower**.
- Built from **real FER \`/predict\` responses to SYNTHETIC images** (the 19 valid C0 fixtures),
  **resampled with replacement**. It is **not** live user video and **not** a scientific result.
- ⛔ **NOT a proposed value for \`tau_face_min\`.** C3B proposes nothing. \`tau_face_min\` is a
  \`[FUTURE-EXPERIMENTAL]\` symbol set by the Phase 7 experiment. The operating-characteristic
  table below is a **curve**, not a value — no row or cell is recommended, preferred, bolded,
  or called suitable.
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
- **N grid (§3.1):** every \`N\` from 1 to 20, then steps of 10 from 30 to 100, then a few
  high-\`N\` rows (250, 500, 1000) kept only to show the convergence trend. This concentrates
  resolution where real sessions live — at 5 fps a realistic turn is ~1-20 seconds of
  continuous capture, i.e. \`N ≈ 5-100\` — and that range is also where the resampling artefact
  (Limit B below) is weakest, so the regrid improves the artifact on both counts.
- **Raw sequences retained on disk:** \`test/integration/C0_10_RAW_SEQUENCES.json\` — every
  individual sequence's averaged confidence, for all ${REPEATS} repeats at every \`N\` in the
  grid (cheap: ~${REPEATS * FRAME_COUNTS.length} floats total).

**Single-frame \`confidence\` across the same 19 fixtures, for contrast only:**
min ${fmt(sfMin)} · median ${fmt(sfMed)} · max ${fmt(sfMax)}
(nb05 measured mean single-frame confidence at 0.929 on a different, larger corpus — see
Limit A.)

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

---

## Operating-characteristic / rejection-rate table (§3.2)

**What this answers:** *"if \`tau_face_min = t\`, what fraction of sequences at frame count \`N\`
would have their averaged face confidence fall below \`t\` — i.e. be rejected?"* Each cell is
the fraction of the ${REPEATS} resampled sequences at that \`N\` whose averaged confidence is
strictly below \`t\`.

⛔ **This is a pure lookup table.** It is a CURVE, not a value. No threshold row is marked
recommended, bolded as preferred, or called suitable, and none should be inferred as such.
Column set (\`N\`) is a documented subset of the full grid above — chosen to keep the low-\`N\`
density where real sessions live, plus a thinned tail — because the full 31-column grid does
not render legibly in Markdown.

| t \\ N | ${OC_N_SUBSET.map((n) => n).join(' | ')} |
|---|${OC_N_SUBSET.map(() => '---:').join('|')}|
${ocTable
  .map((row) => `| ${row.t.toFixed(2)} | ${OC_N_SUBSET.map((n) => fmtPct(row.rates.get(n) ?? NaN)).join(' | ')} |`)
  .join('\n')}

---

## ⛔ Limits — all three carried, undiminished

### Limit A — absolute levels do not transfer

Single-frame confidence across these 19 fixtures has **median ${fmt(sfMed)}**, against nb05's
mean of **0.929** on a larger corpus. **The absolute levels in this table are corpus-specific
and do not transfer to real faces.** The transferable finding is the *shape* of the
convergence, not the values.

### Limit B — at high N the table measures the resampling design, not aggregation behaviour

At high \`N\` the result is determined by the resampling design, not by aggregation behaviour:
i.i.d. draws from a fixed 19-vector corpus converge to that corpus's centroid by the law of
large numbers. **A real session is not i.i.d. draws from a fixed corpus** — it is temporally
correlated frames of one person, whose own centroid is whatever their session actually looked
like. Neither the high-\`N\` confidence values nor the high-\`N\` state mix may be read as a
prediction about production.

**The step-function consequence (raised, not decided):** as \`N\` grows the confidence band
narrows sharply. Any \`tau_face_min\` inside a narrow band becomes close to a step function late
in a session — the face modality tends toward always-usable or never-usable, rather than
degrading gracefully. Whether that is acceptable is a Phase 7 / product judgement.

### Limit C — effective sample size and i.i.d. optimism (\`ML_INPUT_3_CAPTURE_CONSTRAINTS.md\` §2)

Temporally correlated frames carry **less independent information** than i.i.d. draws. The
**effective sample size** of a real \`N\`-frame session is **smaller than \`N\`** — consecutive
frames of one person mid-sentence are near-duplicates. **Real spread at any given \`N\` is
therefore WIDER than this table shows, and convergence is SLOWER.** The band reported here is
a **LOWER BOUND ON SPREAD**, not an estimate of it.

Two consequences, pulling in opposite directions:

- the step-function concern (Limit B) is **less acute in practice** than the table suggests —
  a real session's band will not narrow as fast;
- but a \`tau_face_min\` chosen from these percentiles would be **tuned on an over-converged
  distribution** — i.e. on a narrower band than production will actually produce.

**This limit survives any change of corpus.** Resampling with replacement is i.i.d. by
construction; a future real-face corpus fixes the *levels* (Limit A), not the *independence*
(Limit C). No correlated resampler exists or is planned — there is no video and no temporal
sequence of FER outputs on a single subject anywhere in this project, so any correlation
structure would be invented and would propagate into a Phase 7 calibration wearing the
appearance of a measurement. The i.i.d. resampler stays, with this limit stated: an honest
lower bound beats a fabricated estimate.

---

⛔ **Hand this table to the Phase 7 / \`tau_face_min\` work as the "averaged" distribution, together
with all three limits above.** It replaces the single-frame assumption; it does not name a
threshold.
`;

writeFileSync(OUT, md);
// eslint-disable-next-line no-console
console.log(`wrote ${OUT}`);
// eslint-disable-next-line no-console
console.log(`wrote ${RAW_OUT}`);
for (const r of rows) {
  // eslint-disable-next-line no-console
  console.log(`N=${r.n}\tmin=${fmt(r.min)}\tp50=${fmt(r.p50)}\tmax=${fmt(r.max)}`);
}
