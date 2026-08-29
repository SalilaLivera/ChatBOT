# Decision Record — FER 7→3 Mood-State Mapping and Aggregation Rule

**Project:** IT22638168 · MaternaLink
**Date recorded:** 2026-08-29
**Decided by:** Project owner (Tech Lead role)
**Status:** **PROVISIONAL — conditional on R1 confirmation. NOT frozen.**
**Closes:** OD-4 (provisionally). **Unblocks:** B4 (fusion), once frozen.

**Evidence base:** `ml/fer/outputs/b3_mapping/B3A_SUPERVISOR_FINDINGS.md`
**Governing spec:** `docs/system/MOOD_STATE_SPEC.md` §B2

---

## 1. The decisions

| # | decision | value | status |
|---|---|---|---|
| **D-1** | Derivation basis | **R1** — published AffectNet valence/arousal statistics (Mollahosseini et al., *IEEE TAC* 2019), in place of the raw corpus | taken |
| **D-2** | `surprise` placement | **NEUTRAL** | **provisional**, subject to R1 |
| **D-3** | `disgust` placement | **DISTRESSED** | **provisional**, subject to R1 |
| **D-4** | Aggregation rule | **Rule A — argmax-then-map** | taken |

### Resulting mapping

| FER-2013 class | mood state |
|---|---|
| happy | CALM |
| neutral | NEUTRAL |
| **surprise** | **NEUTRAL** |
| angry | DISTRESSED |
| fear | DISTRESSED |
| sad | DISTRESSED |
| **disgust** | **DISTRESSED** |

This corresponds to candidate **M1** in B3-A, evaluated under **Rule A**.

---

## 2. D-1 — why R1

`MOOD_STATE_SPEC.md` §B2.1 requires the mapping be grounded in AffectNet valence/arousal space.
No AffectNet data exists in this project. R1 uses the **published per-class valence/arousal
table** rather than the raw corpus: citable, no licence required, and it satisfies §B2.1 step 1
in substance — the step asks for per-class distributions, and the paper reports them.

**§B2.2's stated limitation still applies in full and must be reproduced in the dissertation:**
the transfer to FER-2013 is a *categorical* transfer of a rule derived on AffectNet, not a
measurement made on FER-2013. Any systematic difference in how the two datasets apply the same
category label propagates into the mapping. Using published aggregates rather than the corpus
does not soften this; if anything it adds a second step of indirection, which must also be
stated.

---

## 3. D-2 and D-3 — the justification, and what it must NOT rest on

> **⚠ The macro-F1 column in `b3_candidate_comparison.csv` must NOT be cited as support for
> this decision.**

B3-A §3 establishes that macro-F1 **cannot rank these candidates**. M2 and M4 relabel the
ground truth — moving `surprise` changes which state 415 validation rows truly belong to — so
each candidate is scored against a *different label set*. M1's 0.7624 against M4's 0.7260 is a
different task, not a better mapping.

M1 happens to carry the highest macro-F1. **That is not why it was chosen, and anyone writing
this up must not imply that it was.** Citing it would be a straightforward methodological error
and a viva vulnerability.

### What the justification legitimately rests on

**D-2 (`surprise` → NEUTRAL):** the valence/arousal grounding of D-1. Surprise is
high-arousal, **neutral-valence** — it is not intrinsically negative, and treating it as
distress would flag ordinary reactive expressions as a wellbeing concern.

B3-A adds a supporting fact that is *not* itself a justification: when `surprise` is the
7-class argmax, **100% of those 401 rows follow the mapping wherever it points**. The model
recognises surprise cleanly (recall 0.757) but carries **no signal** distinguishing
neutral-valence from calm-valence. The empirical evidence is therefore *silent* on this
placement — it neither supports nor opposes it. The decision must come from D-1.

**D-3 (`disgust` → DISTRESSED):** the valence/arousal grounding of D-1 — disgust is
negative-valence. B3-A supports this weakly: disgust's off-diagonal mass falls to
angry/fear/sad, and 48 of 56 true rows land in DISTRESSED under this placement against 20 of 56
under the alternative. **n=56 at recall 0.500 is underpowered** and is recorded as
corroboration, not as the basis.

---

## 4. D-4 — Rule A, argmax-then-map

**Rule A** takes the 7-class argmax and maps that single label. **Rule B** sums each group's
probability mass and takes the argmax of the three sums.

### Why this decision existed at all

D-4 was **not** in `MOOD_STATE_SPEC.md`. It carried no `[EVIDENCE REQUIRED]` flag and had no
owner. B3-A surfaced it as an unrecorded implicit choice that would otherwise have been settled
by whoever wrote the application layer first — and found it moves the output **more than the
mapping does**.

### Measured consequences (validation, 3,589 images)

| | Rule A | Rule B |
|---|---|---|
| DISTRESSED rate (M1) | **0.4377** | 0.5013 |
| ground-truth DISTRESSED share | 0.466 | 0.466 |
| NEUTRAL recall (M1) | **0.693** | 0.622 |
| 3-state macro-F1 (M1) | 0.7624 | 0.7614 |

Rule B over-predicts DISTRESSED by 6–8 points across every candidate. The cause was isolated by
direct test: on **raw uncalibrated** probabilities Rule B lands within 0.3 points of Rule A
everywhere (M1: 0.4405 vs 0.4377). **The entire inflation is an artefact of temperature scaling
(T = 5.727) flattening the distribution**, so probability mass that argmax discards becomes
decisive under summation.

Rule A is chosen because that inflation is a **numerical artefact of the calibration procedure,
not a property of the underlying expression** — and because Rule A's DISTRESSED rate (0.4377)
sits closer to the ground-truth share (0.466) than Rule B's (0.5013).

### Consequence to carry forward

Rule A discards the information in non-argmax classes. Given that `angry`/`disgust`/`fear`/`sad`
confuse heavily *with each other*, a frame with mass spread across three negative classes but no
single winner will **not** be called DISTRESSED under Rule A. **If the fusion layer or field use
shows distress being under-called, D-4 is the first decision to revisit** — and Rule B is a
one-line change, not a redesign.

---

## 5. Conditions before this becomes FROZEN

1. **R1 must actually be executed.** Obtain the published AffectNet per-class valence/arousal
   table, record the citation and the numbers, and confirm they support `surprise` → NEUTRAL and
   `disgust` → DISTRESSED. **If they do not, D-2 and/or D-3 change — the published table wins,
   not this record.**
2. **§B2.3 acceptance checks** — already satisfied by B3-A for M1: every class assigned, no state
   starved, induced distribution reported (CALM 0.263 / NEUTRAL 0.299 / DISTRESSED 0.438,
   Rule A), `surprise` and `disgust` justified explicitly.
3. **Then, and only then:** the saved test probabilities may be scored **exactly once** for this
   single frozen configuration (M1 · Rule A), per B3-A plan §6 step 3.

**Until step 1 completes, this record is provisional and no test scoring is authorized.**

---

## 6. Honest reporting requirements

Any document, dissertation chapter, or presentation reproducing these results must state:

1. **The 3-state figures are not comparable to the 7-class figures.** 3-state macro-F1
   (0.7624) sits ~0.15 above the 7-class 0.6121 because four confusable classes were merged
   into one state. **The task got easier; the model did not get better.**
2. **macro-F1 does not rank the candidates** (§3).
3. **§B2.2's categorical-transfer limitation**, in full.
4. **All B3-A numbers are validation-only.** No 3-state figure is a test-set result until step 3
   above is executed.

---

## 7. What this record does NOT decide

`τ_face_min`, `N_smooth`, temporal smoothing, the fusion weighting between FER and sentiment,
the sentiment English-input hazard (B2-A §4), or any clinical interpretation. All remain open.
