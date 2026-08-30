# C0.10 — averaged `confidence` vs valid frame count

**Produced by:** Phase C3B, regenerated in follow-up packet 1 (Task 2),
`test/integration/c0_10_gen.mts` · **Date:** 2026-08-30
**Deviations:** D-17 (synthesised sequences, not live capture), D-19 (C3B produces the
artifact the plan assigns to C8.3; C8.3's own measurement still stands).
**Revision:** per `ML_RULINGS_2_RECEIVED.md` §3 — N-grid concentrated at N=1-100 (§3.1) and
an operating-characteristic / rejection-rate table added (§3.2). Both stated limits from the
prior version are carried unchanged, and a third limit (effective sample size /
i.i.d.-optimism) is added per `ML_INPUT_3_CAPTURE_CONSTRAINTS.md` §2.

---

## ⛔ What this is — and is not

- A **characterisation of the aggregation**: it measures how the argmax probability of the
  **mean** 7-vector behaves as the number of averaged frames grows. C3B changes the
  `confidence` handed to fusion from *single-frame argmax* to *argmax of the mean vector*;
  averaging pulls a distribution toward its centre, so the value is **systematically lower**.
- Built from **real FER `/predict` responses to SYNTHETIC images** (the 19 valid C0 fixtures),
  **resampled with replacement**. It is **not** live user video and **not** a scientific result.
- ⛔ **NOT a proposed value for `tau_face_min`.** C3B proposes nothing. `tau_face_min` is a
  `[FUTURE-EXPERIMENTAL]` symbol set by the Phase 7 experiment. The operating-characteristic
  table below is a **curve**, not a value — no row or cell is recommended, preferred, bolded,
  or called suitable.
- ⛔ **No averaged-FER accuracy figure appears.** None exists — the FER-2013 test split is
  spent and the gap cannot be closed (§3A.7).
- ⛔ The averaged confidence is reported **as-is**. It is **not** rescaled or "corrected" to
  resemble single-frame confidence — that would invent a transformation nobody measured.

## Why it matters (§3A.5 / §8.2)

`tau_face_min` gates on this value, and C4 **observed** that gate live (it dropped a face at
confidence 0.25). If Phase 7 calibrates `tau_face_min` against **single-frame** confidences
while production feeds it **averaged** confidences, the threshold is calibrated against the
wrong distribution — and the failure is silent, because the number still looks plausible.
The honest handling: report the averaged confidence as-is and derive the threshold from the
**same** quantity. This artifact is the first evidence toward that, produced early because
Phase 7 may run before C8.3.

---

## Method

- **Source:** 19 valid C0 FER fixtures (`fer_{face,noise,flat,gradient}_*`), real service
  responses, verbatim probabilities.
- For each target frame count `N`, draw `N` fixtures uniformly **with replacement**, feed
  their probability vectors through the C3B `FrameAccumulator`, then through
  `computeTurnFaceEvidence` (mean → derived argmax → **unchanged C3 adapter**).
- Record `evidence.confidence` = the mean vector's argmax probability.
- **3000 independent resampled sequences per `N`.** Deterministic PRNG (seed 20260830) —
  the table is reproducible.
- **N grid (§3.1):** every `N` from 1 to 20, then steps of 10 from 30 to 100, then a few
  high-`N` rows (250, 500, 1000) kept only to show the convergence trend. This concentrates
  resolution where real sessions live — at 5 fps a realistic turn is ~1-20 seconds of
  continuous capture, i.e. `N ≈ 5-100` — and that range is also where the resampling artefact
  (Limit B below) is weakest, so the regrid improves the artifact on both counts.
- **Raw sequences retained on disk:** `test/integration/C0_10_RAW_SEQUENCES.json` — every
  individual sequence's averaged confidence, for all 3000 repeats at every `N` in the
  grid (cheap: ~96000 floats total).

**Single-frame `confidence` across the same 19 fixtures, for contrast only:**
min 0.3418 · median 0.4717 · max 0.8976
(nb05 measured mean single-frame confidence at 0.929 on a different, larger corpus — see
Limit A.)

---

## Result — averaged-argmax `confidence` distribution

| valid frames | min | p10 | median | p90 | max | mean-vector argmax state mix (calm / neutral / distressed) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 0.3418 | 0.3467 | 0.4717 | 0.7769 | 0.8976 | 2487 / 178 / 335 |
| 2 | 0.2448 | 0.3547 | 0.5026 | 0.6862 | 0.8976 | 2928 / 15 / 57 |
| 3 | 0.2550 | 0.3708 | 0.5060 | 0.6480 | 0.8976 | 2963 / 5 / 32 |
| 4 | 0.2454 | 0.3848 | 0.5013 | 0.6227 | 0.8480 | 2986 / 1 / 13 |
| 5 | 0.2688 | 0.4024 | 0.5079 | 0.6131 | 0.7889 | 2999 / 0 / 1 |
| 6 | 0.2712 | 0.4129 | 0.5064 | 0.6071 | 0.7819 | 2998 / 0 / 2 |
| 7 | 0.2619 | 0.4155 | 0.5031 | 0.5959 | 0.7507 | 2999 / 0 / 1 |
| 8 | 0.2876 | 0.4217 | 0.5031 | 0.5858 | 0.7493 | 3000 / 0 / 0 |
| 9 | 0.2972 | 0.4263 | 0.5044 | 0.5848 | 0.7116 | 3000 / 0 / 0 |
| 10 | 0.3212 | 0.4332 | 0.5065 | 0.5790 | 0.7058 | 3000 / 0 / 0 |
| 11 | 0.3211 | 0.4379 | 0.5062 | 0.5778 | 0.6844 | 3000 / 0 / 0 |
| 12 | 0.3152 | 0.4388 | 0.5068 | 0.5770 | 0.6840 | 3000 / 0 / 0 |
| 13 | 0.3571 | 0.4397 | 0.5037 | 0.5697 | 0.6777 | 3000 / 0 / 0 |
| 14 | 0.3056 | 0.4407 | 0.5058 | 0.5719 | 0.6927 | 3000 / 0 / 0 |
| 15 | 0.3403 | 0.4456 | 0.5048 | 0.5679 | 0.7042 | 3000 / 0 / 0 |
| 16 | 0.3510 | 0.4486 | 0.5039 | 0.5648 | 0.6837 | 3000 / 0 / 0 |
| 17 | 0.3487 | 0.4476 | 0.5049 | 0.5645 | 0.6574 | 3000 / 0 / 0 |
| 18 | 0.3481 | 0.4535 | 0.5071 | 0.5627 | 0.6767 | 3000 / 0 / 0 |
| 19 | 0.3738 | 0.4554 | 0.5068 | 0.5608 | 0.6806 | 3000 / 0 / 0 |
| 20 | 0.3433 | 0.4542 | 0.5067 | 0.5605 | 0.6617 | 3000 / 0 / 0 |
| 30 | 0.3881 | 0.4636 | 0.5068 | 0.5490 | 0.6263 | 3000 / 0 / 0 |
| 40 | 0.4086 | 0.4699 | 0.5052 | 0.5432 | 0.5953 | 3000 / 0 / 0 |
| 50 | 0.4212 | 0.4730 | 0.5064 | 0.5396 | 0.6061 | 3000 / 0 / 0 |
| 60 | 0.4216 | 0.4770 | 0.5053 | 0.5357 | 0.5904 | 3000 / 0 / 0 |
| 70 | 0.4246 | 0.4773 | 0.5058 | 0.5348 | 0.6081 | 3000 / 0 / 0 |
| 75 | 0.4215 | 0.4796 | 0.5063 | 0.5335 | 0.5848 | 3000 / 0 / 0 |
| 80 | 0.4397 | 0.4797 | 0.5055 | 0.5323 | 0.5897 | 3000 / 0 / 0 |
| 90 | 0.4418 | 0.4808 | 0.5063 | 0.5316 | 0.5748 | 3000 / 0 / 0 |
| 100 | 0.4411 | 0.4822 | 0.5054 | 0.5292 | 0.5690 | 3000 / 0 / 0 |
| 250 | 0.4660 | 0.4910 | 0.5058 | 0.5210 | 0.5478 | 3000 / 0 / 0 |
| 500 | 0.4718 | 0.4950 | 0.5057 | 0.5164 | 0.5367 | 3000 / 0 / 0 |
| 1000 | 0.4851 | 0.4982 | 0.5060 | 0.5135 | 0.5252 | 3000 / 0 / 0 |

### Reading it

- At **1 frame** the distribution is exactly the single-frame fixture confidences (resampled).
- As `N` grows the spread **collapses toward the corpus centroid's argmax probability** — the
  min/max band narrows and the median settles. This is the averaging effect §3A.5 describes,
  quantified on this corpus.
- The state-mix column shows which state the mean vector's argmax lands on; it is **not** an
  accuracy measure and must not be read as one (the fixtures are synthetic images).

---

## Operating-characteristic / rejection-rate table (§3.2)

**What this answers:** *"if `tau_face_min = t`, what fraction of sequences at frame count `N`
would have their averaged face confidence fall below `t` — i.e. be rejected?"* Each cell is
the fraction of the 3000 resampled sequences at that `N` whose averaged confidence is
strictly below `t`.

⛔ **This is a pure lookup table.** It is a CURVE, not a value. No threshold row is marked
recommended, bolded as preferred, or called suitable, and none should be inferred as such.
Column set (`N`) is a documented subset of the full grid above — chosen to keep the low-`N`
density where real sessions live, plus a thinned tail — because the full 31-column grid does
not render legibly in Markdown.

| t \ N | 1 | 2 | 5 | 10 | 15 | 20 | 30 | 50 | 75 | 100 | 250 | 500 | 1000 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.30 | 0.0% | 4.2% | 0.4% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| 0.35 | 11.2% | 9.7% | 2.6% | 0.4% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| 0.40 | 27.8% | 20.8% | 9.5% | 3.0% | 0.8% | 0.6% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| 0.45 | 48.9% | 36.4% | 24.9% | 16.5% | 11.8% | 8.7% | 4.4% | 1.6% | 0.4% | 0.1% | 0.0% | 0.0% | 0.0% |
| 0.50 | 53.4% | 48.9% | 45.6% | 45.9% | 45.6% | 43.0% | 42.5% | 39.6% | 38.3% | 37.9% | 30.6% | 24.8% | 16.6% |
| 0.55 | 69.3% | 62.4% | 69.7% | 78.7% | 82.5% | 84.9% | 90.3% | 95.3% | 98.0% | 99.3% | 100.0% | 100.0% | 100.0% |
| 0.60 | 69.3% | 75.4% | 86.7% | 95.1% | 97.2% | 99.0% | 99.6% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| 0.65 | 79.5% | 85.7% | 95.7% | 99.5% | 99.9% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| 0.70 | 84.7% | 91.3% | 99.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |

---

## ⛔ Limits — all three carried, undiminished

### Limit A — absolute levels do not transfer

Single-frame confidence across these 19 fixtures has **median 0.4717**, against nb05's
mean of **0.929** on a larger corpus. **The absolute levels in this table are corpus-specific
and do not transfer to real faces.** The transferable finding is the *shape* of the
convergence, not the values.

### Limit B — at high N the table measures the resampling design, not aggregation behaviour

At high `N` the result is determined by the resampling design, not by aggregation behaviour:
i.i.d. draws from a fixed 19-vector corpus converge to that corpus's centroid by the law of
large numbers. **A real session is not i.i.d. draws from a fixed corpus** — it is temporally
correlated frames of one person, whose own centroid is whatever their session actually looked
like. Neither the high-`N` confidence values nor the high-`N` state mix may be read as a
prediction about production.

**The step-function consequence (raised, not decided):** as `N` grows the confidence band
narrows sharply. Any `tau_face_min` inside a narrow band becomes close to a step function late
in a session — the face modality tends toward always-usable or never-usable, rather than
degrading gracefully. Whether that is acceptable is a Phase 7 / product judgement.

### Limit C — effective sample size and i.i.d. optimism (`ML_INPUT_3_CAPTURE_CONSTRAINTS.md` §2)

Temporally correlated frames carry **less independent information** than i.i.d. draws. The
**effective sample size** of a real `N`-frame session is **smaller than `N`** — consecutive
frames of one person mid-sentence are near-duplicates. **Real spread at any given `N` is
therefore WIDER than this table shows, and convergence is SLOWER.** The band reported here is
a **LOWER BOUND ON SPREAD**, not an estimate of it.

Two consequences, pulling in opposite directions:

- the step-function concern (Limit B) is **less acute in practice** than the table suggests —
  a real session's band will not narrow as fast;
- but a `tau_face_min` chosen from these percentiles would be **tuned on an over-converged
  distribution** — i.e. on a narrower band than production will actually produce.

**This limit survives any change of corpus.** Resampling with replacement is i.i.d. by
construction; a future real-face corpus fixes the *levels* (Limit A), not the *independence*
(Limit C). No correlated resampler exists or is planned — there is no video and no temporal
sequence of FER outputs on a single subject anywhere in this project, so any correlation
structure would be invented and would propagate into a Phase 7 calibration wearing the
appearance of a measurement. The i.i.d. resampler stays, with this limit stated: an honest
lower bound beats a fabricated estimate.

---

⛔ **Hand this table to the Phase 7 / `tau_face_min` work as the "averaged" distribution, together
with all three limits above.** It replaces the single-frame assumption; it does not name a
threshold.
