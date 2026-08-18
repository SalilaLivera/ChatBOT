# IT22638168 — Mood State Specification

**Status:** Phase 1 design baseline — Part A frozen at Gate 1A; Part B open
**Date:** 2026-08-19
**Core architecture:** Face + Sinhala/English Text → Mood Fusion → Adaptive Chatbot
**Satisfies:** Detailed Build Master Plan, Phase 1 deliverable `mood_state_specification.md`

---

## 0. How to read this document

This specification is deliberately split into two halves.

| Part | Contents | Status | Changes require |
|---|---|---|---|
| **Part A — Normative** | State semantics, contracts, separation rules, missing-modality behaviour | **Frozen at Gate 1A** | A recorded decision in `docs/decisions/` |
| **Part B — Empirical** | Label mappings, thresholds, weights | **Open** | The producing phase's experiment |

**Part A contains no numeric threshold, weight, or accuracy value, and must not acquire
one.** Every quantity the system needs is declared in Part B as a named symbol whose value
is produced by a specified later phase. This is what allows Phase 1 to close honestly
without inventing values.

Claim types used throughout:

- **[DOCUMENTED]** — already decided in an existing project document; restated here.
- **[PROPOSED]** — new decision introduced by this specification, for supervisor approval.
- **[EVIDENCE REQUIRED]** — cannot be decided yet; the required evidence and its producer are named.
- **[FUTURE-EXPERIMENTAL]** — will be decided by a named later phase's experiment.

---

# PART A — NORMATIVE

## A1. The four application mood states

The application mood state is a **four-valued enumeration**. These exact strings are the
wire format across every module and API. **[DOCUMENTED]** — API and Data Contract §2, §5, §6.

```
calm | neutral | distressed | unknown
```

The mood state is an **application-level support signal**. It is a summary of the evidence
currently available to the system about how the conversation is going. It is not a
measurement of the user's mental health.

### A1.1 `calm`

**Means:** the available evidence suggests the user is settled, positive, or at ease in
this part of the conversation. **[PROPOSED]**

**Does NOT mean:**
- that the user is well, healthy, or free of distress;
- that no support is needed;
- that earlier distress in the session has resolved;
- that any safety condition can be relaxed (see A3).

### A1.2 `neutral`

**Means:** the available evidence suggests no marked emotional signal in either direction —
ordinary conversational tone. **[PROPOSED]**

**Does NOT mean:**
- that the user feels nothing;
- that the user is calm (`neutral` is the absence of a signal, `calm` is a positive signal);
- that the evidence was missing or unusable — that case is `unknown`, not `neutral`.

> The distinction between `neutral` and `unknown` is load-bearing. `neutral` is a
> *conclusion drawn from usable evidence*. `unknown` is *the absence of usable evidence*.
> Collapsing the two would let the system silently report a mood it never measured.

### A1.3 `distressed`

**Means:** the available evidence suggests the user may be having a difficult moment and
that a gentler, more supportive conversational response is appropriate. **[PROPOSED]**

**Does NOT mean:**
- that the user has depression, anxiety, or any clinical condition — **[DOCUMENTED]** FR-17;
- that a clinical threshold has been crossed;
- that the facial expression or the text "proves" distress — **[DOCUMENTED]** Data, Privacy and Safety Architecture §9;
- that an emergency or safety condition exists — that is a **separate** determination (see A3).

Permitted framings when this state influences user-visible language are those already
fixed in Data, Privacy and Safety Architecture §9 (for example, "You seem to be having a
difficult moment"), never diagnostic assertions. **[DOCUMENTED]**

### A1.4 `unknown`

**Means:** no usable mood evidence is currently available from any modality. **[DOCUMENTED]**
API and Data Contract §6.

**Does NOT mean:**
- `neutral`;
- `distressed` — **"Unknown must not be converted into distress automatically."** **[DOCUMENTED]** API and Data Contract §6;
- that an error occurred (a modality being off or low-confidence is normal operation);
- that the conversation should stop.

**Required behaviour:** the system continues as an ordinary supportive chatbot with no
mood conditioning. It must not guess, interpolate, carry forward a stale state as if it
were current, or substitute any other signal. **[DOCUMENTED]** — System Architecture
Specification §4.3 ("The system must never invent a facial mood result"); Master Plan
Phase 7 ("The system must not invent a mood").

## A2. Excluded inputs

Typing speed, response delay, and any other behavioural-interaction signal are **not**
inputs to the mood state. **[DOCUMENTED]** — Behavioural Signal Decision Memo
(`docs/decisions/`), Project Status baseline decision 2, Master Plan §17.2.

They may be recorded as optional telemetry or ablation variables only, and must never
alter the mood state or the chatbot's tone. Reversing this requires a new decision memo.

## A3. Mood state and safety state are separate concepts

**[DOCUMENTED]** — this separation already exists in the repository and is made explicit here:

- Module and Submodule Specification §8 (M7) defines the LLM input as carrying
  `mood_state` **and** `safety_state` as two distinct fields.
- API and Data Contract §2 defines `response_mode: normal | supportive | safety` —
  `safety` is a response mode, not a mood value.
- Master Plan Phase 8 lists "Safety concern" alongside the distress levels as a *response
  mode*, not as a mood class.

### A3.1 The two axes

| Axis | Question it answers | Produced by | Values |
|---|---|---|---|
| **Mood state** | How does the conversation appear to be going? | M5 Mood Fusion, from model evidence | `calm \| neutral \| distressed \| unknown` |
| **Safety state** | Is a predefined high-risk condition present? | M8 Safety Layer, from deterministic rules | Defined in the Safety Policy specification |

### A3.2 Precedence rule **[PROPOSED]**

> **Safety state can override the mood-derived response mode. Mood state can never
> suppress, downgrade, or veto a safety determination.**

Derived from Data, Privacy and Safety Architecture §10 ("The LLM should not be the sole
safety mechanism") and Module Specification §9 ("The safety layer must not depend entirely
on the LLM's own judgement").

Consequences that follow, and that implementations must honour:

1. A `calm` or `unknown` mood **must not** prevent a safety response. Safety detection runs
   on the message regardless of mood state, including when mood is `unknown`.
2. A `distressed` mood **does not by itself** constitute a safety condition. Distress
   changes tone; it does not trigger escalation.
3. The two determinations are computed independently. Neither is an input to the other.

### A3.3 Relationship to `response_mode`

`response_mode` is the **output** of the Adaptive Response Policy (M6), computed from both
axes. It is not a synonym for either.

```
mood_state  ─┐
             ├──> M6 Adaptive Response Policy ──> response_mode
safety_state ┘                                    (normal | supportive | safety)
```

The exact mood→`response_mode` mapping and the distress trigger are Part B / Safety Policy
concerns. What is fixed here is that `safety` as a response mode is reachable from the
safety axis alone.

## A4. Modality evidence contract

Each modality produces evidence in the same shape. **[DOCUMENTED]** — API and Data Contract §3, §4.

```json
{
  "scores": { "calm": 0.0, "neutral": 0.0, "distressed": 0.0 },
  "predicted_state": "calm | neutral | distressed",
  "confidence": 0.0,
  "model_version": "string"
}
```

Rules:

- `scores` is a probability-like vector over the **three substantive states only**.
  `unknown` is never a model output class — it is a system determination made by fusion
  when evidence is unusable. **[PROPOSED]**
- `confidence` is a float in `[0.0, 1.0]`. **[DOCUMENTED]**
- `predicted_state` is the argmax of `scores`. **[PROPOSED]**
- The text modality additionally carries `language`. **[DOCUMENTED]** API and Data Contract §3.
- The class order in the score vector is fixed as `calm, neutral, distressed` wherever an
  ordered array is used (for example a TFLite output tensor). **[PROPOSED]** — this
  discharges the "class order" item of Backlog Sprint 6 at the label level.

### A4.1 What this contract does not fix

Tensor-level details — input dimensions, normalization constants, and the TFLite
input/output tensor specification — depend on a trained model and are **frozen at Phase 3
exit**, not here. Backlog Sprint 6 is therefore split: the label-level contract above is
frozen at Gate 1A; the tensor-level specification is a Phase 3 exit deliverable.

## A5. Confidence handling and the `unknown` conditions

A modality result is **usable** if its confidence meets that modality's minimum threshold.
Otherwise it is **discarded** and treated as unavailable. **[DOCUMENTED]** — FR-12
("Low-confidence model outputs can be excluded from fusion"); API and Data Contract §6.

The threshold values are Part B symbols (`τ_face_min`, `τ_text_min`). The *rule* is frozen
here; the *numbers* are not.

`unknown` is produced when, and only when, **no** modality result is usable. This covers:

- camera disabled, denied, or unavailable, and text unusable;
- both modalities present but both below their confidence thresholds;
- both modalities failing or erroring;
- fusion confidence below `τ_fusion_min` where that check applies.

## A6. Missing-modality rules

**[DOCUMENTED]** — API and Data Contract §6; Master Plan Phase 7; System Architecture
Specification §4.3. Restated here as the authoritative table.

| Face | Text | Result | Modalities used |
|---|---|---|---|
| usable | usable | fused state | `["face", "text"]` |
| unavailable *or* below `τ_face_min` | usable | text-only state | `["text"]` |
| usable | unavailable *or* below `τ_text_min` | face-only state | `["face"]` |
| unavailable/unusable | unavailable/unusable | **`unknown`** | `[]` |

Single-modality results are **not** down-weighted or penalised for being single-modality;
they are reported with the surviving modality's own confidence and an accurate
`modalities_used` list. **[PROPOSED]**

The camera-disabled path is normal operation, not a failure. FR-01, FR-06 and NFR-06
require a fully working text-only experience. **[DOCUMENTED]**

## A7. Fusion output contract

**[DOCUMENTED]** — API and Data Contract §5.

```json
{
  "state": "calm | neutral | distressed | unknown",
  "confidence": 0.0,
  "modalities_used": ["face", "text"],
  "fusion_version": "fusion-v1"
}
```

The fusion rule itself is transparent late fusion over the normalized modality score
vectors. **[DOCUMENTED]** — Module Specification §6; Technology and Model Selection §5.

```
Fused(c) = W_face · Face(c) + W_text · Text(c)     for c in {calm, neutral, distressed}
subject to W_face + W_text = 1
```

`W_face` and `W_text` are Part B symbols. **They must not be assigned values in this
document.** Master Plan Phase 7 is explicit: "Do **not** assume an arbitrary fixed
weighting."

When only one modality is usable, that modality's scores pass through unchanged; the
weights do not apply to the single-modality case. **[PROPOSED]**

## A8. Traceability

| Requirement | Where satisfied |
|---|---|
| FR-12 Confidence handling | A5 |
| FR-13 Mood fusion | A7 |
| FR-14 Missing modalities | A6 |
| FR-15 Adaptive response | A3.3 (interface only; policy in M6) |
| FR-16 Safety response | A3 |
| FR-17 No diagnosis | A1.1–A1.4 negative definitions |
| NFR-11 Independent versioning | A4 `model_version`, A7 `fusion_version` |
| NFR-15 Safe fallback over confident misinterpretation | A1.4, A5, A6 |
| Master Plan Phase 1 "Define the three application mood states" | A1 (three substantive + `unknown`) |
| Backlog Sprint 6 — common label space, score format, missing-modality rules, unknown state | A4, A6, A5, A1.4 |

---

# PART B — EMPIRICAL (OPEN)

Nothing in this part is decided. Each item names what is unresolved, what evidence is
required, who produces it, and when it freezes.

## B1. Parameter register

**No value in this table may be filled by assumption.** A value is written only when the
named producing phase has generated the evidence, and the fill is recorded in
`PROJECT_STATUS.md`.

| Symbol | Meaning | Value | Status | Producer | Freeze point |
|---|---|---|---|---|---|
| `τ_face_min` | Minimum FER confidence for the face result to be usable | **TBD** | [FUTURE-EXPERIMENTAL] | Phase 3 validation sweep | Phase 3 exit |
| `τ_text_min` | Minimum text-model confidence for the text result to be usable | **TBD** | [FUTURE-EXPERIMENTAL] | Phase 4 validation sweep, per language | Phase 4 exit |
| `τ_fusion_min` | Minimum fused confidence below which the state becomes `unknown` | **TBD** | [FUTURE-EXPERIMENTAL] | Phase 7 fusion experiment | Phase 7 exit |
| `τ_distress` | Fused distress score at which supportive content is offered | **TBD** | [FUTURE-EXPERIMENTAL] | Phase 7, against participant self-report | Phase 7 exit |
| `W_face` | Face weight in late fusion | **TBD** | [FUTURE-EXPERIMENTAL] | Phase 7 weighting experiment (equal / validation-derived / confidence-aware) | Phase 7 exit |
| `W_text` | Text weight in late fusion (`= 1 − W_face`) | **TBD** | [FUTURE-EXPERIMENTAL] | as above | Phase 7 exit |
| `N_smooth` | Temporal smoothing window for FER over consecutive frames | **TBD** | [FUTURE-EXPERIMENTAL] | Phase 3 smoothing experiment | Phase 3 exit |

`τ_text_min` may resolve to **two** values, one per language, if Sinhala and English
confidence distributions differ materially. That is itself an open question for Phase 4.

## B2. FER 7-class → 3-state mapping

**[EVIDENCE REQUIRED]** — the mapping table does not exist and must not be guessed.

FER-2013 provides seven categorical classes (`angry`, `disgust`, `fear`, `happy`, `sad`,
`surprise`, `neutral`). The application needs three states. The mapping of the
unambiguous classes is intuitive; the mapping of `surprise` and `disgust` is not, and an
author's opinion is not defensible under examination.

### B2.1 Derivation procedure (approved basis: valence/arousal grounding)

1. **Locate each expression in valence/arousal space.** AffectNet provides continuous
   valence and arousal annotations alongside its categorical labels [F2]. Compute the
   distribution of valence and arousal per categorical class over the AffectNet subset
   permitted for this project.
2. **Define the three application states as regions** in that valence/arousal space, with
   the region boundaries stated and justified in writing.
3. **Assign each of the seven categories** to an application state by where its
   distribution falls. Record the per-class evidence, not just the conclusion.
4. **Transfer the resulting rule to FER-2013** by shared categorical class name.
5. **Cross-check the induced FER-2013 class distribution** for degenerate collapse before
   accepting the mapping (see B2.3).

### B2.2 Stated limitation — must be reproduced in the Phase 2 output and the dissertation

> FER-2013 carries no valence/arousal annotations. Step 4 is therefore a **categorical
> transfer** of a rule derived on AffectNet, not a measurement made on FER-2013. Any
> systematic difference between how the two datasets apply the same category label
> propagates into the mapping. This is a known threat to validity and must be reported as
> such, not concealed.

### B2.3 Acceptance checks for the produced mapping

- Every one of the seven classes is assigned, with recorded per-class evidence.
- No application state receives zero source classes.
- The induced class distribution across the training data is reported, and any severe
  imbalance is carried into the Phase 3 class-imbalance work rather than hidden by the mapping.
- The treatment of `surprise` and `disgust` is justified explicitly, since these are the
  cases the procedure exists to resolve.

**Producer:** Phase 2 dataset analysis pass. **Freeze point:** Phase 2 exit.

## B3. Text label space → 3-state mapping

**[EVIDENCE REQUIRED]** — and this is a harder problem than the FER mapping, for a reason
that must not be glossed over.

Available Sinhala and English sentiment resources are typically **polarity** scales
(positive / negative / neutral). The application states are **affective-support** states
(`calm` / `neutral` / `distressed`). These are not the same axis. "Negative sentiment" is
not equivalent to "distressed", and a positive-polarity message can accompany distress.

The mapping therefore cannot be a relabelling. It requires:

1. A pregnancy-domain annotation guide that defines the three application states for
   annotators directly, in both Sinhala and English (Phase 2 deliverable
   `text_annotation_guidelines.md`).
2. A labelled bilingual validation set annotated against the **application states**, not
   against polarity (`bilingual_validation_dataset.csv`).
3. Reported inter-annotator agreement on that set.
4. An explicit, recorded decision on how any pretrained polarity model's output is adapted
   — whether by fine-tuning onto the application labels, or by a documented projection with
   its error characterised on the validation set.

**Producer:** Phase 2 annotation work; validated in Phase 4. **Freeze point:** Phase 2 exit
for the label definitions; Phase 4 exit for the model's adaptation method.

## B4. Registered open question — is `calm` separable from `neutral`?

**[EVIDENCE REQUIRED]** — flagged deliberately rather than assumed away.

It is not established that either modality can reliably distinguish `calm` from `neutral`
in this application's real conditions. FER in particular may collapse the two, and
polarity-derived text signals may not carry the distinction at all.

**Checkpoint:** at Phase 3 exit and Phase 4 exit, inspect the confusion matrices
specifically for `calm`/`neutral` confusion.

**If the two are not separable:** revise this specification to a documented two-state
substantive space (`neutral` / `distressed`) plus `unknown`, via a recorded decision memo.
This is an acceptable outcome and is cheaper to accept early than to discover during
Phase 7 fusion or, worse, during evaluation.

**Do not** pre-emptively collapse the states now. The three-state design is what the
proposal and master plan specify, and the collapse must be evidence-driven.

## B5. What is deliberately absent from this document

| Item | Owner |
|---|---|
| Mood → `response_mode` policy, tone rules, response length | M6 Adaptive Response Policy, Phase 8 |
| Safety categories, deterministic checks, escalation wording | `SAFETY_POLICY.md` |
| TFLite tensor spec, input dims, normalization | Phase 3 exit |
| Fusion weighting strategy comparison (equal / derived / confidence-aware) | Phase 7 |
| Any accuracy, macro-F1, or latency figure | Phases 3, 4, 7, 11 |

---

## Change control

Part A changes require a decision memo in `docs/decisions/` and an update to
`PROJECT_STATUS.md`. Part B values are filled by their named producing phase and the fill
is recorded in `PROJECT_STATUS.md`; filling a Part B value is not a specification change.

## References

- API and Data Contract — `docs/system/SYSTEM_DESIGN.md (Part 3)`
- Module and Submodule Specification — `docs/system/SYSTEM_DESIGN.md (Part 2)`
- System Architecture Specification — `docs/system/SYSTEM_DESIGN.md (Part 1)`
- Data, Privacy and Safety Architecture — `docs/system/SYSTEM_DESIGN.md (Part 4)`
- Functional and Non-Functional Requirements — `docs/project/REQUIREMENTS.md`
- Detailed Build Master Plan — `docs/project/BUILD_PLAN.md`
- Behavioural Signal Decision Memo — `docs/decisions/`
- [F2] Mollahosseini, A.; Hasani, B.; Mahoor, M.H. (2019). AffectNet: A Database for Facial
  Expression, Valence, and Arousal Computing in the Wild. IEEE TAFFC.
  https://doi.org/10.1109/TAFFC.2017.2740923
