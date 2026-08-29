# AffectNet Valence/Arousal Basis — R1 Literature Task

**Project:** IT22638168 · MaternaLink · FER track
**Task:** R1 — obtain the PUBLISHED AffectNet per-class valence/arousal statistics and test the
two provisional placements D-2 (`surprise` → NEUTRAL) and D-3 (`disgust` → DISTRESSED).
**Date:** 2026-08-29
**Author role:** Research Assistant
**Status:** **COMPLETE — and the headline result is a STOP-AND-REPORT finding.**

**Governing spec:** `docs/system/MOOD_STATE_SPEC.md` §B2 (B2.1, B2.2, B2.3)
**Decision record under test:** `docs/decisions/FER_7TO3_MAPPING_DECISION.md`
**Prior evidence:** `ml/fer/outputs/b3_mapping/B3A_SUPERVISOR_FINDINGS.md`

---

## 0. Bottom line (read this first)

> **The primary source does NOT contain a per-class table of mean/SD valence and arousal for
> the AffectNet categorical classes. It reports valence/arousal per category only as a
> circumplex scatter plot (Fig. 1, Fig. 8) and as a category-blind 2D histogram (Fig. 4 /
> Table 14). No usable per-class numeric table exists in Mollahosseini et al. (2019), and I
> did not find one in the secondary literature checked either.**

Consequently:

| Item | Verdict |
|---|---|
| **D-2** `surprise` → NEUTRAL | **INCONCLUSIVE** — no published AffectNet valence/arousal figure for `surprise` to test it against. |
| **D-3** `disgust` → DISTRESSED | **INCONCLUSIVE** — no published AffectNet valence/arousal figure for `disgust` to test it against. |
| **Can D-2 / D-3 be FROZEN now?** | **NO.** R1 as specified in `FER_7TO3_MAPPING_DECISION.md` §5 condition 1 cannot be completed, because the "published per-class valence/arousal table" that D-1 assumed exists does not exist. |

**This sends D-1 back to the Tech Lead** to choose between:
- **R2** — obtain the AffectNet corpus and compute the per-class distributions directly
  (licence required; prohibited for this task but available to the project);
- **R3** — amend `MOOD_STATE_SPEC.md` §B2.1 to a different, defensible basis;
- **R1′** — a narrower R1: justify the two placements from the *general* circumplex-of-affect
  literature (Russell 1980; Paltoglou & Thelwall 2013 — the circumplex AffectNet's own
  annotators were trained on), explicitly *not* from AffectNet-measured per-class statistics,
  and accept the weaker evidential standing in writing.

The decision record already anticipates this outcome: §5 says "If they do not [support the
placements], D-2 and/or D-3 change — the published table wins, not this record." The published
table not existing is a stronger version of the same trigger.

---

## 1. Full citation(s)

### Primary source (the one D-1 names)

Mollahosseini, A.; Hasani, B.; Mahoor, M. H. (2019). **"AffectNet: A Database for Facial
Expression, Valence, and Arousal Computing in the Wild."** *IEEE Transactions on Affective
Computing*, 10(1), 18–31.
- DOI: `10.1109/TAFFC.2017.2740923`
- arXiv: `1708.03985` (arXiv v1 2017; the arXiv PDF used here is the accepted version, 18 pp.,
  running head "IEEE TRANSACTIONS ON AFFECTIVE COMPUTING").
- PDF consulted: `https://arxiv.org/pdf/1708.03985` (retrieved 2026-08-29).

### Secondary sources checked for a derived per-class table

- Wagner, N.; Mätzler, F.; Vossberg, S. R.; Schneider, H.; Pavlitska, S.; et al. (2024).
  **"CAGE: Circumplex Affect Guided Expression Inference."** *CVPR Workshops (ABAW)*.
  arXiv: `2404.14975`. Retrieved 2026-08-29.
  → Reports valence/arousal per AffectNet category **only as plots** (Fig. 4 circumplex
  scatter by category; Fig. 5 per-category valence and arousal distributions). **No numeric
  per-class mean/SD table.** Prose statement quoted in §2.3 below.
- EmergentMind topic page "AffectNet: Facial Emotion Analysis Benchmark"
  (`https://www.emergentmind.com/topics/affectnet`) — secondary summary, no primary table.
- General web/Semantic Scholar search for
  `"AffectNet" per-category mean valence arousal "standard deviation" table` — no result
  returning a numeric per-class table traceable to a primary source.

---

## 2. The valence/arousal information that IS published

### 2.1 Primary source — what exists, with exact locations

| # | Where | What it contains | Is it a per-class V/A table? |
|---|---|---|---|
| Fig. 1 | p. 1, caption *"Sample images in Valence Arousal circumplex"* | ~... sample images plotted in the V/A circumplex; category not the axis of the figure | **No** — a scatter/illustration, not tabulated data |
| §3.2.2, p. 8 | *"A predefined estimated region of valence and arousal was defined for each categorical emotion in the annotation software (e.g., for happy emotion the valence is in (0.0, 1.0], and the arousal is in [-0.2, 0.5])."* | Annotation **prior** (a soft constraint shown to annotators as a warning region), given in prose for `happy` only; the other seven regions are not printed in this paper | **No** — and it is an input constraint, not a measured distribution |
| Fig. 4 | p. 8, caption *"Histogram (number of frames in each range/area) of valence and arousal annotations"* | 2D histogram of annotated-image counts across the V/A plane | **No** — counts are **category-blind** (all categories pooled) |
| Table 5 | p. 8, *"Annotators' Agreement in Dimensional Model of Affect"* | RMSE / CORR / SAGR / CCC between two annotators on valence and on arousal (same-category: V RMSE 0.190, A RMSE 0.261; all: V RMSE 0.340, A RMSE 0.362) | **No** — inter-annotator agreement, not per-class location |
| Fig. 8 | p. 17, caption *"Sample images in Valence Arousal circumplex with their corresponding Valence and Arousal values (V: Valence, A: Arousal)"* | 25 individual example images each labelled with a single (V, A) pair, e.g. `V: 0.0 A: 0.0`, `V: 0.95 A: 0.17`, `V: -0.85 A: -0.38` | **No** — hand-picked single examples, not aggregates; category not stated |
| Table 14 | p. 17, *"Number of annotated images in each range/area of valence and arousal"* | The numeric version of Fig. 4: a 10×10 grid of image counts over valence bins ([-1,-.8]…[.8,1]) × arousal bins | **No** — still **category-blind** |
| Table 3 | p. 7, *"Number of Annotated Images in Each Category"* | Per-category image counts (Neutral 80,276; Happy 146,198; Sad 29,487; Surprise 16,288; Fear 8,191; Disgust 5,264; Anger 28,130; Contempt 5,135) | Per-class, but **counts, not V/A** |

**There is no table or figure in Mollahosseini et al. (2019) that reports, for each expression
category, a mean (or median) valence and a mean (or median) arousal with a spread.** The
closest the paper comes is the *category-blind* histogram (Fig. 4 / Table 14) and the
per-category annotation *prior* region (prose, `happy` only).

### 2.2 The one per-class numeric fact the primary source prints

From §3.2.2, p. 8 — the **annotation-software region** (a prior shown to annotators, NOT a
measured statistic; reproduced here only for completeness):

| Class | Valence region (published) | Arousal region (published) |
|---|---|---|
| happy | `(0.0, 1.0]` | `[-0.2, 0.5]` |
| neutral, sad, surprise, fear, disgust, anger, contempt | **not printed in this paper** | **not printed in this paper** |

> ⚠ This is an *input constraint to the annotation process*, not an output distribution.
> `MOOD_STATE_SPEC` §B2.1 step 1 asks for "the distribution of valence and arousal per
> categorical class" — i.e. what annotators actually assigned. This region is the opposite:
> what they were nudged toward before assigning. It cannot substitute for the measured
> distribution, and using it as if it were data would be circular.

### 2.3 Secondary source — CAGE (2024), qualitative statements only

From CAGE §3, describing their Fig. 4 and Fig. 5 (per-category V/A plots computed on a subset
of the AffectNet **training** set):

> *"the visualization clearly reveals that different expression categories can lead to an
> overlap in the valence/arousal values. … For example, neutral and happiness expressions
> share a similar median in arousal dimension, whilst having a different median in the valence
> dimension. As expected, the neutral category is centered around zero for valence and
> arousal."*

This is the **only** published, source-traceable, per-class valence/arousal claim I could
locate, and it is:
- qualitative ("centered around zero", "different median") — **no numbers**;
- limited to `neutral` and `happy`;
- silent on `surprise` and `disgust` — the two classes R1 exists to decide;
- derived from a figure, not tabulated.

Per the task prohibitions, I did not read coordinates off CAGE Fig. 4/Fig. 5 by eye.

### 2.4 What can be said, and its evidential rank

| Claim | Support | Rank |
|---|---|---|
| `neutral` sits at ≈ (valence 0, arousal 0) | CAGE §3 prose (qualitative); consistent with AffectNet annotation design | usable, weak |
| `happy` has positive valence | AffectNet annotation region `(0.0, 1.0]` (prior, not measurement); CAGE §3 | usable, weak |
| `surprise` valence and arousal position | **nothing published, per-class, from AffectNet** | none |
| `disgust` valence and arousal position | **nothing published, per-class, from AffectNet** | none |

---

## 3. The three mood-state regions in valence/arousal space

### 3.1 What the spec fixes, and what it does not

`MOOD_STATE_SPEC` Part A (A1.1–A1.3) defines the three substantive states **semantically**,
not in valence/arousal coordinates, and Part A "contains no numeric threshold … and must not
acquire one" (§0). §B2.1 step 2 requires the regions be "stated and justified in writing" as
part of the Phase 2 mapping work — i.e. the boundaries are a **Part B** artefact to be
produced here, not lifted from Part A.

Semantic anchors from Part A:
- **`calm`** (A1.1): "settled, positive, or at ease" — a **positive** signal.
- **`neutral`** (A1.2): "no marked emotional signal in either direction — ordinary
  conversational tone"; explicitly "the absence of a signal, `calm` is a positive signal".
- **`distressed`** (A1.3): "may be having a difficult moment" — a **negative** signal.

### 3.2 Proposed regions (produced by R1, marked [PROPOSED])

Axes: valence ∈ [−1, 1] (negative → positive), arousal ∈ [−1, 1] (calm → activated), per
AffectNet's scale (CAGE Table 3; Mollahosseini §3.2.2).

| State | Valence | Arousal | Rationale |
|---|---|---|---|
| **DISTRESSED** | `valence < −0.2` | any | A1.3 "difficult moment" ⇒ negative affect. Distress is a valence-negative condition regardless of activation (a shut-down low-arousal low mood and an agitated high-arousal one are both distress). |
| **NEUTRAL** | `−0.2 ≤ valence ≤ +0.2` | any | A1.2 "no marked signal in either direction" ⇒ a band around zero valence. "Any arousal" because ordinary conversational tone spans quiet-to-animated without being either positive or negative in feeling. |
| **CALM** | `valence > +0.2` | `arousal ≤ +0.3` | A1.1 "settled, positive, at ease" ⇒ positive valence **and** not highly activated. The arousal ceiling separates "at ease" from high-energy positive states (excited/elated), which are positive but not "settled"; those fall outside all three regions and, lacking a home, default to the nearest — NEUTRAL by the argmax rule if their valence is modest, CALM only if genuinely low-arousal. |

**Boundary justification — the ±0.2 valence band:**
- It coincides with the central column/row boundaries of the **only** category-blind numeric
  V/A artefact in the primary source: Table 14 (p. 17) uses bin edges at
  …, −0.2, 0, +0.2, … and its single largest cell is valence [.4,.6] × arousal [−.2,0]
  (42,219 images) with the −0.2…+0.2 valence band and −0.2…+0.2 arousal band holding the bulk
  of the mass — i.e. the corpus itself treats ±0.2 as the "near-neutral" zone.
- It is consistent with the `happy` annotation region starting exactly at valence `0.0`
  (§3.2.2): the design placed the positive/neutral break at zero, and ±0.2 is a tolerance
  around it rather than a new claim.
- CAGE's "`neutral` is centered around zero" is compatible with any symmetric band; ±0.2 is
  the smallest band that also lands on a published bin edge.

**Boundary justification — the CALM arousal ceiling `+0.3`:**
- This one is **weaker**. No published AffectNet number motivates a specific value. `+0.3` is
  chosen so the `happy` annotation region (`arousal [-0.2, 0.5]`) is mostly-but-not-entirely
  inside CALM — reflecting that `happy` is predominantly a calm-positive state but its
  upper-arousal tail (broad grins, laughter, excitement) is not "settled". It should be
  revisited if R2/R3 produces a real `happy` arousal distribution.
- If the Tech Lead prefers the simpler sketch ("low-to-moderate arousal" with no hard
  ceiling), CALM collapses to `valence > +0.2, any arousal` and the mapping outcomes in §4–§5
  are unchanged (neither `surprise` nor `disgust` is positive-valence under any published
  reading).

### 3.3 `unknown`

Out of scope for the V/A regions: `unknown` is a fusion-time determination (spec A5), never a
region and never a model output class.

---

## 4. D-2 — does published valence/arousal support `surprise` → NEUTRAL?

### Verdict: **INCONCLUSIVE**

**Numbers that drive it:** none exist. There is no published AffectNet per-class valence or
arousal figure for `surprise` — not in Mollahosseini et al. (2019) (see §2.1: `surprise` is
absent from the prose annotation region, and Fig. 1 / Fig. 4 / Fig. 8 / Table 14 are not
per-class), and not in CAGE (2024), whose prose statement covers only `neutral` and `happy`.

### What this means for the placement

- **NEUTRAL is not *supported* by a published number.** It is not *contradicted* by one
  either. The evidential basis D-1 promised is simply not on the table.
- B3-A already established that the FER validation evidence is **silent** on this placement
  (when `surprise` is the argmax, 100% of 401 rows follow the mapping wherever it points;
  the model carries no neutral-valence vs calm-valence signal). So **both** legs of the
  evidence — the empirical FER leg and the published-V/A leg — are now empty for `surprise`.
- The specific risk the task flags: *if* the published mean valence for `surprise` were
  meaningfully **positive**, that would argue for **CALM**, not NEUTRAL. **I cannot evaluate
  that risk** because the number is not published. The general circumplex literature
  (Russell 1980; the Paltoglou & Thelwall 2013 circumplex used to train AffectNet's
  annotators, cited as ref [61]) places surprise at high arousal and valence near zero /
  slightly positive — but that is **not an AffectNet-measured statistic**, it is the
  textbook circumplex, and per the task's prohibitions I am not entitled to convert it into
  "the published table says". It is noted here only as the direction a proper R2/R3 would
  most likely confirm or refute.

### Can D-2 be frozen?

**No.** `FER_7TO3_MAPPING_DECISION.md` §5 condition 1 is unmet.

---

## 5. D-3 — does published valence/arousal support `disgust` → DISTRESSED?

### Verdict: **INCONCLUSIVE**

**Numbers that drive it:** none exist. `disgust` is absent from every per-class artefact in
the primary source (§2.1) and from CAGE's prose (§2.3).

### What this means for the placement

- DISTRESSED is neither supported nor contradicted by a published AffectNet number.
- B3-A's empirical support is explicitly recorded as weak: n = 56, 7-class recall 0.500,
  48/56 true rows landing in DISTRESSED under this placement vs 20/56 under the alternative —
  "underpowered … recorded as corroboration, not as the basis" (`FER_7TO3_MAPPING_DECISION.md`
  §3).
- The general affect literature treats disgust as a canonically **negative-valence** emotion
  (it is one of the six basic negative emotions; the circumplex places it firmly in the
  negative-valence half). Under the §3.2 regions, negative valence ⇒ DISTRESSED. **But**,
  as with `surprise`, this is the textbook circumplex, **not an AffectNet-measured
  statistic**, and R1 as specified requires the latter.
- Of the two placements, D-3 is the *less* fragile — it would be surprising for any credible
  measurement to put disgust at positive or near-zero valence — but "would be surprising" is
  not the standard §B2.1 sets.

### Can D-3 be frozen?

**No** — same reason as D-2. It is more likely than D-2 to survive R2/R3 unchanged, but that
is a prediction, not evidence, and freezing on it would repeat exactly the "an author's
opinion is not defensible under examination" failure mode §B2 exists to prevent.

---

## 6. Required limitations

### 6.1 §B2.2 limitation — categorical transfer (reproduce wherever the mapping appears)

> FER-2013 carries **no valence/arousal annotations**. Any 7→3 mapping grounded in
> valence/arousal space is derived on **AffectNet** and then transferred to FER-2013 by
> shared category-label name alone. This is a **categorical transfer of a rule**, not a
> measurement made on FER-2013. Any systematic difference between how the two datasets apply
> the same category label — different annotator pools, different elicitation (in-the-wild web
> query vs. the FER-2013 curation), different image statistics, different implicit intensity
> thresholds — **propagates directly and invisibly into the mapping**. This is a known threat
> to validity and must be reported as such in the Phase 2 output and the dissertation, not
> concealed.

### 6.2 R1-specific second layer — aggregate indirection (NEW, must also be stated)

> D-1 chose to use **published aggregates** in place of the AffectNet corpus. This adds a
> **second step of indirection** on top of §6.1:
> 1. We cannot inspect the per-class valence/arousal **distributions** — only whatever summary
>    a paper chose to print.
> 2. We therefore cannot check for **multimodality** (e.g. a category that is bimodal in
>    valence would be badly served by a single mean), **skew**, or **outlier contamination**.
> 3. We cannot compute **our own** region boundaries against the actual mass of each class; we
>    are restricted to the boundaries and summaries other authors happened to publish.
> 4. Any published summary reflects **that paper's** subset, preprocessing, and train/val
>    split (CAGE, for instance, uses "a subset of the train dataset"), which we cannot
>    reconcile against the subset "permitted for this project" that §B2.1 step 1 names.
>
> **In this instance the indirection was fatal to R1:** the aggregate we needed (a per-class
> V/A table) was never published at all, so R1 could not be executed even in principle from
> the literature. That is itself the strongest possible demonstration of why the indirection
> matters.

---

## 7. What could not be found — stated plainly

1. **A per-class mean/SD (or median/IQR) valence table** for the AffectNet categorical
   classes — **does not exist** in Mollahosseini et al. (2019). Not in any table, not in any
   figure caption, not in the appendix.
2. **A per-class mean/SD arousal table** — same: does not exist in the primary source.
3. **The annotation-software V/A regions for the seven non-`happy` classes** — referred to in
   §3.2.2 ("A predefined estimated region … was defined for each categorical emotion") but
   **not printed** in this paper. Only `happy` is given, and it is a prior, not a measurement
   (§2.2).
4. **A source-traceable derived per-class V/A table in the secondary literature** — not found
   in CAGE (2024) (plots only) or in the general search performed. CAGE offers qualitative
   prose for `neutral` and `happy` only (§2.3).
5. **Any published AffectNet valence or arousal statistic specific to `surprise` or
   `disgust`** — the two classes this entire task exists to decide. Nothing, quantitative or
   qualitative, in either source.
6. Not attempted, by task prohibition: reading coordinates off Fig. 1 / Fig. 8 / CAGE
   Fig. 4–5; accessing the AffectNet corpus; consulting the AffectNet website's download
   documentation (which may contain the full region table but is corpus-access-gated).

---

## 8. Report-back — the seven deliverable items

1. **Citations** — §1. Primary: Mollahosseini, Hasani & Mahoor (2019), *IEEE TAC* 10(1):18–31,
   DOI `10.1109/TAFFC.2017.2740923`, arXiv `1708.03985`. Secondary checked: CAGE, arXiv
   `2404.14975`.
2. **Per-class V/A table as published** — §2. **No such table is published.** The primary
   source gives per-category *counts* (Table 3, p. 7), a *category-blind* V/A histogram
   (Fig. 4 / Table 14, p. 8 & p. 17), an annotation *prior* region for `happy` only
   (§3.2.2, p. 8: valence `(0.0, 1.0]`, arousal `[-0.2, 0.5]`), and 25 single-image V/A
   examples (Fig. 8, p. 17). None is a per-class distribution.
3. **Three state regions** — §3.2, [PROPOSED]: DISTRESSED `valence < −0.2`; NEUTRAL
   `−0.2 ≤ valence ≤ +0.2`; CALM `valence > +0.2 ∧ arousal ≤ +0.3`. The ±0.2 valence band is
   justified against Table 14's bin edges and the `happy` region's zero crossing; the CALM
   arousal ceiling is weakly justified and flagged for revision.
4. **D-2 verdict** — §4: **INCONCLUSIVE**. No published AffectNet valence/arousal figure for
   `surprise` exists. NEUTRAL is not supported by a published number; nor is it contradicted.
   The "positive valence ⇒ argue for CALM" risk cannot be assessed from published data.
5. **D-3 verdict** — §5: **INCONCLUSIVE**. No published AffectNet valence/arousal figure for
   `disgust` exists. DISTRESSED is consistent with the general circumplex placement of disgust
   as negative-valence, but that is textbook, not an AffectNet measurement, and R1 requires
   the latter.
6. **Limitations** — §6.1 (§B2.2 categorical transfer, reproduced verbatim in spirit) and
   §6.2 (the R1 aggregate-indirection layer — and the note that here the indirection was fatal
   because the needed aggregate was never published).
7. **Not found** — §7: no per-class valence table, no per-class arousal table, no
   `surprise`/`disgust` V/A statistic anywhere, no seven-class annotation-region table in this
   paper, no source-traceable derived table in the secondary literature.

### Can D-2 and D-3 be FROZEN?

**No — neither.** R1, as `FER_7TO3_MAPPING_DECISION.md` §5 condition 1 defines it ("Obtain the
published AffectNet per-class valence/arousal table"), **cannot be completed**: that table does
not exist in the published literature. D-1 (derivation basis) must return to the Tech Lead to
choose **R2** (obtain corpus, compute distributions), **R3** (amend §B2.1), or **R1′** (justify
from the general circumplex-of-affect literature with the weaker standing stated in writing).
Until D-1 is re-decided and D-2/D-3 rest on an actual basis, they remain **provisional**, and
per §5 the single test-set scoring of M1 · Rule A **is not authorized**.

### What does NOT change

- **D-4 (Rule A, argmax-then-map)** is unaffected by this finding — it rests on the temperature
  -flattening artefact analysis in B3-A, not on valence/arousal.
- **The mapping's direction is not overturned.** Nothing found here contradicts
  `surprise` → NEUTRAL or `disgust` → DISTRESSED; the finding is an *absence of the required
  evidence*, not evidence against. The M1 mapping remains the working assumption for any
  non-frozen downstream work.
