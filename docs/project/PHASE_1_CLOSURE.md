# IT22638168 — Phase 1 Closure Record

**Status:** Gate 1A **COMPLETE** · Gate 1B open (runs in parallel with Phase 2)
**Consolidated:** 2026-08-19

Phase 1 (System and Research Design) closed its first gate on 2026-08-19. This document
consolidates the three Phase 1 governance documents into one record. **No content was
changed** — each part is its original document verbatim, with heading levels shifted down
one.

| Part | Content | Original document |
|---|---|---|
| A | Gap analysis, dependency derivation, Gate 1A/1B model | `PHASE_1_CLOSURE.md` |
| B | Closure checklist — the gate authority | `PHASE_1_CLOSURE.md` |
| C | Sprint-level work list | `PHASE_1_CLOSURE.md` |

## Gate status at consolidation

| Gate | Status | Effect |
|---|---|---|
| **Gate 1A** | ✅ **COMPLETE** (2026-08-19) | **Phase 2 is open.** Supervisor approved the Mood State Specification; FER-2013 research use verified; experiment metadata handled by the ML notebooks rather than separate infrastructure. |
| **Gate 1B** | ⬜ Open | Safety sign-off, storage feasibility spike, target device naming, mock end-to-end, citation diff review. Proceeds alongside Phase 2. |

> **Gate 1A item 4 — resolution.** The original checklist required a separate
> experiment/reproducibility infrastructure. This was resolved differently: run ID, dataset
> version, model version, hyperparameters, seed, metrics and timestamp are recorded
> **automatically by each ML notebook** (see `ml/README.md`). NFR-12 is satisfied by that
> mechanism; no manual tracking infrastructure is required at this stage.

> **Gate 1A item on text-model work** — Sinhala/English text label mapping (§B3 of the mood
> state specification) moves to the sentiment phase rather than the FER phase. It remains
> required before the text model is trained, not before FER work begins.

---


# Part A — Gap Analysis and Dependency Derivation

> Source: `PHASE_1_CLOSURE.md` (content unchanged).

## IT22638168 — Phase 1 Gap Closure Plan

**Status:** Active
**Date:** 2026-08-19
**Purpose:** Separate the Phase 1 gaps that genuinely block dataset and model development
from those that can legitimately remain open, close only the former, and enter Phase 2.

---

### 1. Principle

The objective is **not** to resolve every open question before Phase 2. It is to close the
gaps that block the build, and to make every remaining gap *explicit, owned and scheduled*
rather than silently unresolved.

No gap is closed by assumption. Where the existing documents do not support a decision,
this plan records **[EVIDENCE REQUIRED]** with the evidence and its producer named.

Claim types used across all Phase 1 documents:

| Type | Meaning |
|---|---|
| **[DOCUMENTED]** | Already decided in an existing project document |
| **[PROPOSED]** | New decision introduced for supervisor approval |
| **[EVIDENCE REQUIRED]** | Cannot be decided yet; evidence and producer named |
| **[FUTURE-EXPERIMENTAL]** | Decided by a named later phase's experiment |

### 2. Constraints this plan preserves

- No redesign of the approved architecture.
- Behavioural signals stay out of core fusion (Behavioural Signal Decision Memo;
  Project Status baseline decision 2; Master Plan §17.2).
- No invented mappings, thresholds, weights, accuracies or latencies.
- No human participant contact, no final model training, no fusion-weight selection before
  the relevant gate.

### 3. Audit finding — two Phase 1 deliverables were missing

Cross-check of the Master Plan's seven Phase 1 deliverables against the repository, at the
time this plan was written:

| Master-plan deliverable | Status found | Resolution |
|---|---|---|
| `requirements.md` | Present as `REQUIREMENTS.md` | — |
| `architecture.md` | Present as `01_System_Architecture_Specification.md` | — |
| `api_contract.md` | Present as `03_API_and_Data_Contract.md` | — |
| `local_storage_schema.md` | Present as `IT22638168_Local_Storage_and_Data_Schema.md` | — |
| `mood_state_specification.md` | **MISSING** | Created — Gap 1 |
| `model_interfaces.md` | **PARTIAL** — I/O shapes only; no class order or tensor spec | Split — Gap 10 |
| `safety_policy.md` | **MISSING** | Created — Gap 9 |

Gaps 9 and 10 were not in the original gap list and were found by this audit.

### 4. Derived dependency order

Derived from actual inter-document dependencies.

```
                    ┌─────────────────────────────────┐
                    │  MOOD STATE SPECIFICATION       │  ← the only true Phase 2 blocker
                    │  (Part A — normative)           │
                    └────┬───────────┬───────────┬────┘
                         │           │           │
        ┌────────────────┘           │           └──────────────┐
        ▼                            ▼                          ▼
  Dataset licensing          AI interface freeze          Safety Policy
  + experiment structure     (label level)                (state vs safety split)
        │                            │                          │
        └──────────┬─────────────────┘                          │
                   ▼                                            ▼
            ═══ GATE 1A ═══                              Mock E2E (Sprint 7)
                   │                                            │
                   ▼                                     Storage spike ──┐
        PHASE 2 DATASET PREP                             Doc cleanup ────┤
                   │                                     Governance ─────┤
        ┌──────────┴──────────┐                                          ▼
        ▼                     ▼                                   ═══ GATE 1B ═══
   PHASE 3 FER          PHASE 4 TEXT
        │                     │
        │              Text placement decision  ← resolved HERE, not in Phase 1
        └──────────┬──────────┘
                   ▼
        PHASE 5 MOBILE ← storage technology needed HERE
                   │
        PHASE 6 BACKEND ← LLM provider selected HERE
                   │
        PHASE 7 FUSION ← weights and thresholds frozen HERE
```

#### 4.1 Why the gate is split

Phase 2 depends on exactly **one** Phase 1 artefact: the Mood State Specification. Dataset
preparation needs the application label space (FER label mapping, text annotation guide).
It does not touch storage, the LLM, text-model placement, or safety policy.

Holding Phase 2 behind those unrelated items would delay model development for no
technical reason. Master Plan §13 explicitly permits parallel phases.

| Gate | Contents | Effect |
|---|---|---|
| **Gate 1A** | Mood State Spec Part A; FER mapping procedure; dataset licensing; experiment structure | **Phase 2 may begin** |
| **Gate 1B** | Safety policy; storage spike; benchmark plan; decision memos; doc cleanup; mock E2E; governance | **Phase 1 formally closed** — runs in parallel with Phase 2 |

### 5. Gap register

| # | Gap | Decision | Blocker | Document |
|---|---|---|---|---|
| 1 | Mood states unspecified | Split normative (frozen) / empirical (open) | **Gate 1A** | `docs/system/MOOD_STATE_SPEC.md` |
| 2 | M4 text-model placement | **Defer to Phase 4 exit**; criteria pre-registered now | No | `decisions/TEXT_MODEL_PLACEMENT_DECISION.md` |
| 3 | Local storage technology | Tier the existing entities; select after spike | Gate 1B (needed by Phase 5) | `decisions/LOCAL_STORAGE_DECISION.md` |
| 4 | LLM provider | **Defer to Phase 6** — already correct; add provider boundary | No | `03_API_and_Data_Contract.md` §13 |
| 5 | Performance targets | Separate four concepts; freeze protocol, not numbers | No | `docs/system/PERFORMANCE_BENCHMARK_PLAN.md` |
| 6 | Citation artifacts | Replace with real references; never delete | Gate 1B | 7 files in `docs/system/` |
| 7 | Governance not updated | Update register/status/backlog/master plan | Gate 1B | `PHASE_1_CLOSURE.md` |
| 9 | Safety policy missing | Author; wording DRAFT pending ethics | Gate 1B | `docs/system/SAFETY_POLICY.md` |
| 10 | Model interfaces partial | Split label level (now) / tensor level (Phase 3 exit) | Partial — Gate 1A | Mood State Spec §A4 |

### 6. Notes on individual resolutions

#### 6.1 Gap 2 — the privacy argument does not decide text placement

Recorded because it is the likely reasoning error: on-device FER is a genuine privacy win
because raw frames would otherwise leave the device. Text mood is different — the message
**already** goes to the backend for the LLM. Moving text inference on-device does not stop
the source text being transmitted. Privacy is scored neutral between the options; the
decision turns on Sinhala quality, model size and measured latency.

#### 6.2 Gap 3 — the AsyncStorage contradiction is a category error

Proposal §3.3 names AsyncStorage; storage schema §11 forbids unencrypted key-value storage
for sensitive conversation data. These conflict only if "local data" is one class. Tiering
the schema's existing entities dissolves the conflict without redesigning the schema.

#### 6.3 Gap 5 — the performance "conflict" is terminological

The Proposal's 3 s / 5 s figures are **design aspirations**; NFR-08's "measure, don't
invent" concerns **engineering requirements and results**. Once the four concepts are named
separately there is no contradiction. No target can be frozen in Phase 1 because no model
exists to measure.

#### 6.4 Gap 6 — replace, never delete

Each artifact stood in for a real citation. Deleting them would have downgraded sourced
statements to unsourced assertions. All 30 were replaced with OWASP MASVS control
references, literature codes, or repository-relative document sections.

**Correction to the original audit counts:** `05_Technology_and_Model_Selection.md` and
`04_Data_Privacy_and_Safety_Architecture.md` contained 6 artifacts each, not 5. The total
of 30 was correct.

#### 6.5 Gap 1 — the `calm` / `neutral` question is registered, not answered

It is not established that either modality can separate `calm` from `neutral` in real
conditions. This is registered as a named Phase 3 / Phase 4 confusion-matrix checkpoint. If
they prove inseparable, the specification is revised to two substantive states plus
`unknown` via a decision memo. Pre-emptively collapsing them now would not be
evidence-driven.

### 7. What must NOT be started

**[DOCUMENTED]** — Phase 1 Implementation Backlog, "Do Not Start Yet":

- final FER model training;
- fusion weight selection;
- any claimed accuracy figure;
- human participant data collection;
- production deployment;
- any reintroduction of behavioural signals into fusion.

### 8. Related documents

- `PHASE_1_CLOSURE.md` — the single gate authority
- `master_plan/PHASE_1_CLOSURE.md` — the work list
- `PROJECT_STATUS.md` — current phase and open decisions
- `DOCUMENT_REGISTER.md` — full document inventory

---

# Part B — Closure Checklist (gate authority)

> Source: `PHASE_1_CLOSURE.md` (content unchanged).

## IT22638168 — Phase 1 Closure Checklist

**Status:** Active — Gate 1A open, Gate 1B open
**Date:** 2026-08-19
**Authority:** This document is the **single gate authority** for Phase 1 closure. The
Phase 1 Implementation Backlog is the *work* list; this is the *evidence* list. Where they
appear to disagree, this document governs.

---

### How to use this checklist

An item is ticked **only when evidence exists and is linked**, not when the work feels
done. "Evidence" means a document section, a recorded measurement, a spike result, or a
named approval — not an assertion.

**Automated pre-check.** Run `python docs/project/verify_docs.py` before
each gate. It checks the mechanical invariants — no citation artifacts, no numeric values
in Mood State Spec Part A, every parameter symbol still `TBD`, behavioural fusion absent,
deliverables present, benchmark plan value-free, register complete. It cannot check
approvals, spike results, or measurements; those remain human items below.
Last run 2026-08-19: **all checks passed**.

| Gate | Meaning |
|---|---|
| **Gate 1A** | Phase 2 dataset preparation may begin |
| **Gate 1B** | Phase 1 is formally closed; may run in parallel with Phase 2 |

---

## GATE 1A — unblocks Phase 2

Only these four items genuinely block dataset work.

### 1A.1 Mood State Specification — Part A frozen

- [x] Document exists — `docs/system/MOOD_STATE_SPEC.md`
- [x] Four states defined with semantics (§A1)
- [x] Explicit "does NOT mean" clause per state (§A1.1–A1.4)
- [x] `neutral` vs `unknown` distinction stated (§A1.2)
- [x] Mood state and safety state separated, with precedence direction (§A3)
- [x] `unknown` never coerced to distress (§A1.4)
- [x] All four missing-modality cases enumerated (§A6)
- [x] Modality evidence contract and class order fixed (§A4)
- [x] Fusion output contract restated (§A7)
- [x] Parameter register present; every symbol has owner phase and `TBD` status (§B1)
- [x] **Zero numeric thresholds, weights or accuracies present in Part A**
- [ ] **Supervisor approval of Part A** ← *outstanding*

### 1A.2 FER mapping procedure documented

- [x] Valence/arousal derivation procedure documented (§B2.1)
- [x] Categorical-transfer limitation stated (§B2.2)
- [x] Acceptance checks for the produced mapping defined (§B2.3)
- [x] Text label-space mapping problem stated, including the polarity-vs-affect mismatch (§B3)
- [ ] Mapping **table** produced ← *Phase 2 deliverable, not a Gate 1A item*

### 1A.3 Dataset licensing verified

- [ ] FER-2013 terms of use verified and recorded ← *outstanding, user action*
- [ ] AffectNet access terms verified and recorded ← *outstanding, user action*
- [ ] Permitted-use position recorded in writing for the dissertation

> Master Plan Phase 2 task 1 is "Acquire permitted datasets" and Technology and Model
> Selection §3 already qualifies AffectNet as "subject to permitted use and exact dataset
> terms". This must be confirmed before download, not after.

### 1A.4 Experiment and reproducibility structure defined

- [ ] Experiment/run ID scheme defined ← *outstanding*
- [ ] Dataset versioning scheme defined
- [ ] Seed recording convention defined
- [ ] Result-recording format defined (model version, device, parameters, metrics)

> Required by NFR-12 and Master Plan Phase 2 "Research" handoff. Cheap to define now and
> expensive to retrofit once experiments have run.

#### ═══ GATE 1A DECISION ═══

- [ ] All 1A.1–1A.4 items evidenced → **Phase 2 dataset preparation may begin**

---

## GATE 1B — formal Phase 1 closure

May proceed in parallel with Phase 2.

### 1B.1 Safety policy

- [x] Document exists — `docs/system/SAFETY_POLICY.md`
- [x] Safety categories SC-01…SC-08 enumerated and traceable to Master Plan Phase 8
- [x] Safety state enumeration defined, separate from mood state
- [x] Precedence rule restated (safety overrides mood; mood never suppresses safety)
- [x] Deterministic detection layer properties specified
- [x] Outbound response constraint rules specified
- [x] Draft English wording present and marked **DRAFT — PENDING ETHICS REVIEW**
- [x] Sinhala wording marked [EVIDENCE REQUIRED], explicitly not machine-translated
- [x] Test scenarios enumerated, including precedence and LLM-failure cases
- [ ] Sign-off table (§7) completed ← *outstanding, supervisor + ethics*
- [ ] **No wording deployed to any user** — verify at every subsequent gate

### 1B.2 Text-model placement

- [x] Memo exists — `decisions/TEXT_MODEL_PLACEMENT_DECISION.md`
- [x] Criteria fixed with reasoning
- [x] Privacy non-decisiveness recorded explicitly
- [x] Decision sequence and tie-break pre-registered
- [x] Decision field marked `UNRESOLVED — resolve at Phase 4 exit`
- [x] API contract confirmed placement-agnostic
- [ ] `S_ceiling` and `Δ_sinhala` set ← *Phase 4 entry, not a Phase 1 item*

### 1B.3 Local storage

- [x] Memo exists — `decisions/LOCAL_STORAGE_DECISION.md`
- [x] Tier table T0–T3 proposed across the schema's existing entities
- [x] `ConsentState` T2 placement justified
- [x] Proposal/schema contradiction reconciled in writing
- [x] Storage schema §11 points to the memo
- [ ] Tier table approved by supervisor ← *outstanding*
- [ ] **Feasibility spike executed** on the named physical device ← *outstanding*
- [ ] Spike check 2 — keystore key custody verified, not assumed
- [ ] Spike check 5 — deletion completeness verified against schema §13 leakage paths
- [ ] Technology selected with recorded reasoning

### 1B.4 Performance benchmark plan

- [x] Document exists — `docs/system/PERFORMANCE_BENCHMARK_PLAN.md`
- [x] Four-concept terminology defined and adopted in NFR-08
- [x] Metrics P-01…P-19 defined with instrumentation points and producing phases
- [x] Measurement protocol specified (warm-up, repetitions, median + p95, conditions)
- [x] Emulator exclusion stated explicitly
- [x] **Zero invented values present**
- [ ] Physical target device named, with Android version and RAM/SoC ← *outstanding, before Phase 3 exit*

### 1B.5 LLM provider

- [x] Provider boundary defined — `03_API_and_Data_Contract.md` §13
- [x] M6 and M8 declared provider-independent
- [x] Prompt/safety wording declared versioned project assets
- [x] Reproducibility recording required (NFR-12)
- [x] Constraint recorded: no Phase 2/3/4 artefact may name a provider
- [ ] Provider selected ← *Phase 6, correctly deferred*

### 1B.6 Document cleanup

- [x] All 30 citation artifacts replaced, not deleted
- [x] Zero `citeturn` / `filecite` / private-use-area characters remain repository-wide
- [x] Replacements resolve to OWASP MASVS controls, literature codes, or document sections
- [ ] Diff review confirming no technical statement changed meaning ← *outstanding, reviewer pass*
- [ ] Every `[M#]`/`[S#]`/`[F#]`/`[T#]` code used in design docs verified against the
      literature review reference list

### 1B.7 Mock end-to-end verification (Backlog Sprint 7)

- [ ] Mock pipeline built against the frozen contracts
- [ ] Case: face + text → fused state
- [ ] Case: text only
- [ ] Case: face only
- [ ] Case: neither → `unknown`, and **no mood invented**
- [ ] Case: low confidence → modality discarded
- [ ] Case: safety condition → fires regardless of mood state
- [ ] Case: safety condition while mood is `calm` → still fires
- [ ] Case: safety condition while LLM unavailable → deterministic response still returned

> The last three cases verify the founding safety principle rather than the happy path and
> must not be dropped.

### 1B.8 Technology feasibility (Backlog Sprint 8, split by dependent phase)

**Before Phase 3:**
- [ ] TFLite integration path verified
- [ ] Physical target Android device secured

**Before Phase 5:**
- [ ] React Native / Expo camera path verified
- [ ] Sinhala Unicode rendering verified
- [ ] Local storage option verified (= 1B.3 spike)
- [ ] Secure storage option verified

### 1B.9 Governance

- [ ] `DOCUMENT_REGISTER.md` lists every document, including all of `docs/system/`
- [ ] `PROJECT_STATUS.md` corrected — the "no Phase 1 deliverables exist" statement removed
- [ ] `PROJECT_STATUS.md` open-decisions section populated with owner phases
- [ ] Phase 1 Implementation Backlog updated; its duplicate gate section replaced by a
      pointer to this checklist
- [ ] Master Plan Phase 1 deliverables annotated with actual filenames
- [ ] Behavioural fusion confirmed still absent from every specification

#### ═══ GATE 1B DECISION ═══

- [ ] All 1B.1–1B.9 items evidenced → **PHASE 1 COMPLETE**

---

### Not permitted until Gate 1B closes

**[DOCUMENTED]** — Phase 1 Implementation Backlog, "Do Not Start Yet":

- final FER model training;
- fusion weight selection;
- any claimed accuracy figure;
- human participant data collection;
- production deployment;
- adding behavioural signals to fusion.

Phase 2 dataset preparation is explicitly **permitted** after Gate 1A. Phase 3 and Phase 4
model development follow Phase 2 in the normal dependency order and are not gated on
Gate 1B, with the exception of the TFLite and device checks in §1B.8.

### Outstanding items summary

| Item | Gate | Owner |
|---|---|---|
| Supervisor approval of Mood State Spec Part A | 1A | Supervisor |
| FER-2013 + AffectNet licence verification | 1A | Student |
| Experiment/reproducibility structure | 1A | Student |
| Safety policy sign-off | 1B | Supervisor + ethics |
| Storage tier approval + feasibility spike | 1B | Student + supervisor |
| Target device named | 1B | Student |
| Citation diff review | 1B | Reviewer |
| Mock E2E | 1B | Student |
| Governance updates | 1B | Student |

---

# Part C — Implementation Backlog (work list)

> Source: `PHASE_1_CLOSURE.md` (content unchanged).

## IT22638168 — Phase 1 Implementation Backlog

**Goal:** Complete system design before main AI/data implementation.

> **This document is the Phase 1 _work_ list.** The Phase 1 _evidence_ and gate authority is
> `docs/project/PHASE_1_CLOSURE.md`. Where the two appear to
> disagree, the closure checklist governs. Updated 2026-08-19 by the gap-closure pass.
>
> **Gate model:** Phase 1 closes in two gates. **Gate 1A** (mood-state specification,
> dataset licensing, experiment structure) unblocks Phase 2. **Gate 1B** closes Phase 1
> formally and may run in parallel with Phase 2. Rationale in
> `docs/project/PHASE_1_CLOSURE.md` §4.

### Phase 1 Definition

Phase 1 is complete when we can answer:

> What are we building, what does every module accept/produce, where does it run, what is stored, what APIs exist, how are privacy/safety enforced, and how will the research be evaluated?

---

### Sprint 1 — Repository Baseline ✅ COMPLETE

- [x] Confirm canonical repository root.
- [x] Update document register. *(2026-08-19: `docs/system/` documents and this backlog added.)*
- [x] Design documents are in canonical locations.

**Superseded sub-tasks:** the per-topic subfolders (`architecture/`, `requirements/`,
`api/`, `database/`, `privacy/`, `safety/`, `technology/`) were **not** created. The
documents live as flat files directly in `docs/system/`, which is adequate at this
document count and avoids churning cross-references. Recorded rather than silently dropped.

**Exit:** Repository locations are stable. ✅

---

### Sprint 2 — Requirements Freeze

- [ ] Review FR-01 to FR-25.
- [ ] Review NFR-01 to NFR-15.
- [ ] Verify proposal traceability.
- [ ] Verify behavioural fusion is absent.
- [ ] Verify acceptance criteria.
- [ ] Mark unresolved measurable targets as TBD rather than inventing values.

**Exit:** Implementation tasks do not conflict with the requirements baseline.

---

### Sprint 3 — Storage Freeze *(Gate 1B — spike, then decide)*

> Revised 2026-08-19: this sprint becomes **spike-then-decide**. The technology cannot be
> selected by review alone; it requires a feasibility spike on the physical target device.
> Tier assignment and spike definition are in
> `docs/decisions/LOCAL_STORAGE_DECISION.md`.
> Not a Phase 2/3/4 blocker — required before Phase 5.

- [x] Review entities. *(Tiered T0–T3 in the storage decision memo.)*
- [ ] Decide local-only vs synchronized history.
- [ ] **Run the feasibility spike** (6 checks, including keystore custody and deletion completeness).
- [ ] Select local database/storage technology.
- [ ] Define schema versioning/migrations.
- [ ] Define retention.
- [ ] Define deletion.
- [ ] Define backup/cache policy.
- [ ] Confirm raw-frame exclusion.
- [ ] Confirm research-data separation.

**Exit:** Storage can be implemented without inventing a schema.

---

### Sprint 4 — API Contract Freeze

- [ ] Review chat request/response.
- [ ] Review text mood interface.
- [ ] Review fusion interface.
- [ ] Review integration context.
- [ ] Review error contract.
- [ ] Define authentication requirements.
- [ ] Define API versioning.
- [ ] Define validation.
- [ ] Define timeout/retry behaviour.

**Exit:** Mobile/backend/mock services can use the same contract.

---

### Sprint 5 — Privacy and Safety Freeze

- [ ] Finalize camera-consent flow.
- [ ] Define camera permission lifecycle.
- [ ] Define raw-frame lifecycle.
- [ ] Define sensitive logging rules.
- [ ] Define LLM data-minimization rules.
- [ ] Define safety categories.
- [ ] Define deterministic safety checks.
- [ ] Draft escalation wording for ethics review.

**Exit:** Privacy and safety behaviour is documented before implementation.

---

### Sprint 6 — AI Interface Freeze *(split 2026-08-19)*

> This sprint bundled two kinds of item with different dependencies. **Label-level** items
> can be frozen now and are needed by Phase 2. **Tensor-level** items depend on a trained
> model and cannot be frozen before Phase 3 exit. Splitting them lets Gate 1A close.

#### 6A — Label level *(Gate 1A — frozen in `MOOD_STATE_SPEC.md`)*

- [x] Common label space — §A1
- [x] Class order (`calm, neutral, distressed`) — §A4
- [x] Score format and confidence format — §A4
- [x] Output classes, both modalities — §A4
- [x] Missing-modality rules — §A6
- [x] Unknown state — §A1.4, §A5
- [x] Weight configuration *declared as symbols*, values open — §B1
- [x] Language codes — API contract §3 (`si | en | mixed`)
- [ ] Text preprocessing contract — Phase 2 (`text_annotation_guidelines.md`)
- [ ] Mixed-language fallback behaviour — Phase 2 / Phase 4

#### 6B — Tensor level *(deferred to Phase 3 exit — depends on a trained model)*

- [ ] Input dimensions.
- [ ] Normalization constants.
- [ ] TFLite input/output specification.
- [ ] Temporal-smoothing interface and `N_smooth`.

**Exit (6A):** Phase 2 can define labels and annotate without guessing. ✅
**Exit (6B):** Real models plug in without changing application contracts.

---

### Sprint 7 — Mock End-to-End Prototype

Build:

```text
Mock mobile input
      ↓
Mock text mood + mock face mood
      ↓
Fusion
      ↓
Mood state
      ↓
Response policy
      ↓
Mock chatbot response
```

Test:
- face + text;
- text only;
- face only;
- neither;
- low confidence;
- safety condition.

**Exit:** Architecture works without trained models.

---

### Sprint 8 — Technology Verification *(split by dependent phase, 2026-08-19)*

> These checks gate different phases. Bundling them would hold FER work behind mobile-only
> concerns. Split so each check blocks only what actually depends on it.

#### Before Phase 3 (FER)
- [ ] Verify TFLite integration path.
- [ ] Verify/secure the physical target Android device *(also OD-10, benchmark plan §3)*.

#### Before Phase 5 (Mobile)
- [ ] Verify React Native/Expo camera path.
- [ ] Verify Sinhala rendering.
- [ ] Verify local storage option *(= the Sprint 3 spike)*.
- [ ] Verify secure-storage option.

#### Before Phase 6 (Backend)
- [ ] Verify backend framework.
- [ ] Verify LLM option *(provider selection is Phase 6 — see API contract §13)*.

Do not build the complete application before these feasibility checks.

---

## Phase 1 Final Gate

> **Moved 2026-08-19.** The gate checklist previously duplicated here now lives in
> **`docs/project/PHASE_1_CLOSURE.md`**, which is the single
> gate authority. Maintaining two gate lists risked them drifting apart, with no rule for
> which one governed.
>
> That checklist covers everything this section listed, split across **Gate 1A** (unblocks
> Phase 2) and **Gate 1B** (formal Phase 1 closure), and additionally requires linked
> evidence for each item rather than a bare tick.

**Do not mark Phase 1 complete from this document.** Close it against the checklist.

## Phase 2 Handoff

After Phase 1, begin **Phase 2 — Dataset and Data Pipeline Preparation**:

#### FER
- dataset acquisition and usage verification;
- class mapping;
- preprocessing;
- augmentation;
- train/validation/test split;
- dataset audit.

#### Text
- English resources;
- Sinhala resources;
- pregnancy-domain examples;
- annotation;
- mixed-language strategy;
- dataset audit.

#### Research
- experiment IDs;
- dataset versions;
- annotation protocol;
- reproducibility structure.

> **Gate note (2026-08-19):** Phase 2 dataset preparation begins after **Gate 1A**, not
> after full Phase 1 closure. Gate 1A requires the Mood State Specification Part A
> approved, the FER mapping procedure documented, dataset licences verified, and the
> experiment/reproducibility structure defined. Gate 1B items proceed in parallel.

### Do Not Start Yet

The list below is unchanged and applies until **Gate 1B**:

- train the final FER model;
- choose final fusion weights;
- claim achieved accuracy;
- collect human participant data;
- deploy production infrastructure;
- add typing behaviour to fusion.

---
