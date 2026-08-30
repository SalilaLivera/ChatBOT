# C0.10 — averaged `confidence` vs valid frame count

**Produced by:** Phase C3B, `test/integration/c0_10_gen.mts` · **Date:** 2026-08-30
**Deviations:** D-17 (synthesised sequences, not live capture), D-19 (C3B produces the
artifact the plan assigns to C8.3; C8.3's own measurement still stands).

---

## ⛔ What this is — and is not

- A **characterisation of the aggregation**: it measures how the argmax probability of the
  **mean** 7-vector behaves as the number of averaged frames grows. C3B changes the
  `confidence` handed to fusion from *single-frame argmax* to *argmax of the mean vector*;
  averaging pulls a distribution toward its centre, so the value is **systematically lower**.
- Built from **real FER `/predict` responses to SYNTHETIC images** (the 19 valid C0 fixtures),
  **resampled with replacement**. It is **not** live user video and **not** a scientific result.
- ⛔ **NOT a proposed value for `tau_face_min`.** C3B proposes nothing. `tau_face_min` is a
  `[FUTURE-EXPERIMENTAL]` symbol set by the Phase 7 experiment.
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

**Single-frame `confidence` across the same 19 fixtures, for contrast only:**
min 0.3418 · median 0.4717 · max 0.8976
(nb05 measured mean single-frame confidence at 0.929 on a different, larger corpus.)

---

## Result — averaged-argmax `confidence` distribution

| valid frames | min | p10 | median | p90 | max | mean-vector argmax state mix (calm / neutral / distressed) |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 0.3418 | 0.3467 | 0.4717 | 0.7769 | 0.8976 | 2487 / 178 / 335 |
| 2 | 0.2448 | 0.3547 | 0.5026 | 0.6862 | 0.8976 | 2928 / 15 / 57 |
| 5 | 0.2585 | 0.4006 | 0.5033 | 0.6153 | 0.7956 | 2995 / 0 / 5 |
| 10 | 0.3257 | 0.4313 | 0.5065 | 0.5806 | 0.7687 | 3000 / 0 / 0 |
| 25 | 0.3774 | 0.4576 | 0.5047 | 0.5534 | 0.6309 | 3000 / 0 / 0 |
| 50 | 0.4173 | 0.4726 | 0.5062 | 0.5402 | 0.5979 | 3000 / 0 / 0 |
| 100 | 0.4490 | 0.4826 | 0.5060 | 0.5298 | 0.5720 | 3000 / 0 / 0 |
| 250 | 0.4627 | 0.4919 | 0.5064 | 0.5211 | 0.5467 | 3000 / 0 / 0 |
| 500 | 0.4756 | 0.4958 | 0.5058 | 0.5163 | 0.5357 | 3000 / 0 / 0 |
| 1000 | 0.4849 | 0.4984 | 0.5060 | 0.5135 | 0.5276 | 3000 / 0 / 0 |

### Reading it

- At **1 frame** the distribution is exactly the single-frame fixture confidences (resampled).
- As `N` grows the spread **collapses toward the corpus centroid's argmax probability** — the
  min/max band narrows and the median settles. This is the averaging effect §3A.5 describes,
  quantified on this corpus.
- The state-mix column shows which state the mean vector's argmax lands on; it is **not** an
  accuracy measure and must not be read as one (the fixtures are synthetic images).

⛔ **Hand this table to the Phase 7 / `tau_face_min` work as the "averaged" distribution.**
It replaces the single-frame assumption; it does not name a threshold.
