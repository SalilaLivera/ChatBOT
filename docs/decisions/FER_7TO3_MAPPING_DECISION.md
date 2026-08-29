# Decision Record — FER 7→3 Mood-State Mapping and Aggregation Rule

**Project:** IT22638168 · MaternaLink
**Date recorded:** 2026-08-29
**Decided by:** Project owner (Tech Lead role); D-1/D-2/D-3 confirmed by academic supervisor
**Status:** **FROZEN** (2026-08-29, after R1 execution — see §5)
**Closes:** OD-4. **Unblocks:** the single test scoring, then B4 (fusion).

**Evidence base:** `ml/fer/outputs/b3_mapping/B3A_SUPERVISOR_FINDINGS.md`
**Governing spec:** `docs/system/MOOD_STATE_SPEC.md` §B2

---

## 1. The decisions

| # | decision | value | status |
|---|---|---|---|
| **D-1** | Derivation basis | **R1 attempted and found not executable** (§2). Basis is academic-supervisor direction, consistent with the canonical affective circumplex. | **resolved** |
| **D-2** | `surprise` placement | **NEUTRAL** | **FROZEN** |
| **D-3** | `disgust` placement | **DISTRESSED** | **FROZEN** |
| **D-4** | Aggregation rule | **Rule A — argmax-then-map** | **FROZEN** |

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

## 2. D-1 — R1 was attempted, and the required evidence does not exist

`MOOD_STATE_SPEC.md` §B2.1 requires the mapping be grounded in AffectNet valence/arousal space.
No AffectNet data exists in this project, so D-1 initially chose **R1**: use the *published*
per-class valence/arousal table instead of the raw corpus.

**R1 was executed on 2026-08-29 and established that no such table is published.**
Full record: `docs/decisions/AFFECTNET_VALENCE_AROUSAL_BASIS.md`.

Mollahosseini, Hasani & Mahoor (*IEEE TAC* 10(1):18–31, 2019; DOI 10.1109/TAFFC.2017.2740923;
arXiv:1708.03985) reports valence/arousal per category **only as a circumplex scatter** (Figs. 1
and 8) and a **category-blind** 2D histogram (Fig. 4 / Table 14). No mean, SD, or median is
published per class. The secondary source checked (CAGE, arXiv:2404.14975) presents per-category
values as plots only, with prose covering `neutral` and `happy` and **silent on `surprise` and
`disgust`** — the two classes the derivation exists to resolve. This absence was confirmed by an
independent search.

**Crucially, R1 did not estimate coordinates off a scatter plot.** Doing so would have produced
numbers that looked like measurements, propagated into the dissertation, and been effectively
unfalsifiable. The absence was reported instead.

### Resolution

The **academic supervisor** directed that `disgust` → DISTRESSED and `surprise` → NEUTRAL be
adopted without further derivation work.

**This record must therefore NOT claim AffectNet grounding.** The basis is:

1. **Supervisory expert judgement** — the operative authority for this decision.
2. **Consistency with the canonical affective circumplex** (Russell, 1980), on which AffectNet's
   own annotation scheme was built: `disgust` is negative-valence; `surprise` is high-arousal,
   neutral-valence.
3. **Weak empirical corroboration for D-3 only**, from B3-A (§3).

**This is a weaker evidential standing than §B2.1 specifies, and that must be stated wherever
the mapping is reported** (see §6). The honest framing is: *the specified derivation was
attempted, the required published statistics were shown not to exist, and the mapping was
settled by supervisory judgement consistent with the standard circumplex.* That is defensible.
Claiming an AffectNet-derived mapping would not be.

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

## 5. Freeze conditions — status

1. **R1 executed.** ✅ Completed 2026-08-29. Outcome: the required published statistics **do not
   exist** (§2). Resolved by supervisory direction rather than by the specified derivation, with
   the reduced evidential standing recorded.
2. **§B2.3 acceptance checks.** ✅ Satisfied by B3-A for M1: every class assigned; no state
   starved; induced distribution reported (CALM 0.263 / NEUTRAL 0.299 / DISTRESSED 0.438 under
   Rule A); `surprise` and `disgust` treated explicitly.
3. **Single test scoring.** ⏳ **NOW AUTHORIZED** — the saved test probabilities may be scored
   **exactly once**, for this single frozen configuration (**M1 · Rule A**), per B3-A plan §6
   step 3. One shot. No candidate comparison, no rule comparison, no re-scoring.

**This record is FROZEN.** Any change to D-2, D-3 or D-4 after the test scoring invalidates that
scoring, because the configuration it reports would no longer be the deployed one.

---

## 6. Honest reporting requirements

Any document, dissertation chapter, or presentation reproducing these results must state:

1. **The 3-state figures are not comparable to the 7-class figures.** 3-state macro-F1
   (0.7624) sits ~0.15 above the 7-class 0.6121 because four confusable classes were merged
   into one state. **The task got easier; the model did not get better.**
2. **macro-F1 does not rank the candidates** (§3).
3. **§B2.2's categorical-transfer limitation**, in full — **and** that §B2.1's AffectNet
   valence/arousal derivation **could not be performed**, because the required per-class
   statistics are not published (§2). The mapping rests on supervisory judgement consistent with
   the standard affective circumplex, not on an AffectNet measurement. **Do not describe the
   mapping as AffectNet-derived.**
4. **All B3-A numbers are validation-only.** No 3-state figure is a test-set result until step 3
   above is executed.

---

## 7. What this record does NOT decide

`τ_face_min`, `N_smooth`, temporal smoothing, the fusion weighting between FER and sentiment,
the sentiment English-input hazard (B2-A §4), or any clinical interpretation. All remain open.

---

# AMENDMENT 1 — FER soft evidence for multimodal fusion

**Status: APPROVED** · 2026-08-29 · Approved by the project owner (Tech Lead role)
**Amends:** §A4 of `docs/system/MOOD_STATE_SPEC.md` (see A1.6)
**Does NOT amend:** D-4, which remains FROZEN

## A1.1 What is decided

**D-4 (Rule A — argmax-then-map) REMAINS FROZEN.** It continues to define the **standalone FER
3-state prediction**: the label FER reports as its own answer, and the label the final test
scoring measured (macro-F1 0.7681, accuracy 0.7668).

This amendment decides a question D-4 never addressed: **what three numbers represent a face
when FER evidence is passed to fusion.**

D-4 answered *"which state does FER choose?"*. Fusion asks *"how much does FER lean toward each
state?"*, because `Fused(c) = W_face·Face(c) + W_text·Text(c)` multiplies a **number** by a
weight. A label cannot be multiplied.

## A1.2 The two quantities — distinct, and to be named distinctly

| | **standalone FER state** | **FER fusion evidence** |
|---|---|---|
| what it is | one label | a 3-vector of soft scores |
| derivation | **Rule A** — argmax of the 7, then map | **grouped sums** of the 7 calibrated probabilities |
| governed by | **D-4, FROZEN** | this amendment |
| used for | FER's own reported prediction; the test result | fusion arithmetic only |

**Grouping:**
`calm = p(happy)` · `neutral = p(neutral) + p(surprise)` ·
`distressed = p(angry) + p(disgust) + p(fear) + p(sad)`

**`predicted_state` on the evidence object is the Rule-A label**, NOT the argmax of the grouped
scores. `confidence` is FER's argmax probability — the confidence in the Rule-A decision.

**Worked example.** FER returns
`angry .20, disgust .05, fear .15, happy .25, neutral .20, sad .10, surprise .05`:

- Rule A → **CALM** (argmax `happy` = 0.25) → `predicted_state`
- grouped → `{calm 0.25, neutral 0.25, distressed 0.50}` → `scores`
- `confidence` = **0.25**

The evidence states: *"my decision is CALM, but my probability mass leans DISTRESSED."* For a
7-class model collapsed into 3 states, that is an accurate description, not a contradiction.

## A1.3 Why grouped scores rather than one-hot

Rule A deliberately discards the distribution **when choosing a label** — B3-A measured Rule B's
DISTRESSED inflation as an artefact of temperature scaling (T = 5.727), not a property of the
expression. But discarding it for the *label* does not make it worthless as *evidence*: the
grouped vector was measured **well-calibrated** (ECE 0.0101–0.0166 against the 7-class 0.0126).

One-hot scores would make the face an **absolute veto** whenever `W_face ≥ 0.5`, since
`0.6 × 1.0` cannot be overcome by text's maximum `0.4`. That would nullify the mechanism B4
identified as most important: **text is the only recovery path for FER's 24.3% distress miss
rate.** The confidence gate would not compensate — nb05 measured FER's mean confidence at
**0.929**, so its mistakes are confident ones and clear any plausible threshold.

## A1.4 May the fused state differ from the standalone FER state?

**Both modalities usable — YES. This is fusion working, not failing.**
A fusion layer that could never contradict one modality would be pointless; text exists to change
the answer when it disagrees. In the A1.2 example, with text at `distressed 0.70` and
`W_face = 0.6`, the fused state is **DISTRESSED** while standalone FER says **CALM**. That is the
intended behaviour and is how a missed distress is recovered.

**Face-only (text unusable or absent) — NO. The output state MUST equal the Rule-A label.**
With no second modality there is nothing to weigh against, so any divergence would be Rule A
being silently overridden by arithmetic rather than by evidence. **This is an invariant.**

## A1.5 Reporting consequence

The standalone FER state and the fused state are **different quantities and must be labelled as
such**. The measured 0.7681 macro-F1 describes the **standalone FER state only**. **No fused
performance figure exists**, and none may be inferred from it. The fusion layer remains
**unvalidated** — see `B4_FUSION_FINDINGS.md`.

## A1.6 Spec amendment — §A4 exemption, recorded explicitly

> **`MOOD_STATE_SPEC.md` §A4 states: "`predicted_state` is the argmax of `scores`." That
> requirement is hereby AMENDED to EXEMPT face-modality evidence.**
>
> **Face evidence:** `predicted_state` is the **Rule-A label** and MAY differ from
> `argmax(scores)`.
> **Text evidence:** the §A4 requirement is UNCHANGED and remains enforced. The sentiment model
> is natively 3-class, so no such gap exists on that side.

The amended clause carries **[PROPOSED]** status in §A4, whereas D-4 is **FROZEN**. This
amendment therefore relaxes the weaker of the two constraints.

## A1.7 Residual tension — recorded, not concealed

When both modalities are usable, the fused state is computed from grouped vectors, so **Rule B's
arithmetic does re-enter through the fusion path.** The defence is that the fused state is a
*fusion* decision while D-4 governs FER's *standalone* label. That is an interpretation, not
something the spec settles, and it was approved with that understanding.

## A1.8 Scope of the implementation this authorises

Only the three changes in A1.9, plus conformance tests. **It introduces no weighting default, no
threshold, and no Phase 7 parameter**, and makes **no claim that fusion is validated**.

## A1.9 Required changes

1. `dev/fusion/fusion/contract.py` — permit `predicted_state != argmax(scores)` for **face**
   evidence; keep enforcing it for **text**.
2. `dev/fusion/fusion/fusion.py` — single-modality passthrough must return the modality's
   `predicted_state` instead of re-deriving it with `argmax_state(scores)`. `scores` still pass
   through unchanged (§A6).
3. `dev/fusion/tests/` — new conformance tests for the exemption, for text still being rejected
   on divergence, and for the **A1.4 face-only invariant**.
