# IT22638168 — Project Control

**Authoritative record of current phase, completed work, open decisions and governance.**

_Last updated: 2026-08-19 (repository restructure; Gate 1A closed)_

Supersedes `PROJECT_STATUS.md`, archived at `../archive/PROJECT_STATUS_superseded_2026-08-19.md`.

---

## 1. Current phase

> ## **PHASE 2 — DATASET AND MODEL DEVELOPMENT**

| Milestone | Status |
|---|---|
| **Gate 1A** | ✅ **COMPLETE** — 2026-08-19 |
| Supervisor approval of Mood State Specification | ✅ **COMPLETE** |
| FER-2013 research-use verification | ✅ **COMPLETE** |
| Experiment tracking infrastructure | ✅ **RESOLVED** — handled by ML notebooks, no separate infrastructure |
| **Gate 1B** | ⬜ Open — runs in parallel, does not block Phase 2 |

**Next major task:** FER-2013 dataset preparation → MobileNetV2 transfer learning.

Work location: `ml/fer/notebooks/`, starting at `01_dataset_exploration.ipynb`.

## 2. Completed work

- **Literature review** — 49 papers extracted and tiered, gap matrix produced,
  existing-systems comparison produced, full review written. `../research/`
- **Architecture decision — behavioural signals removed from core fusion** — typing speed
  and response delay evaluated against the literature (Epp 2011, Lee 2015, Ghosh 2019,
  Eisele 2021, Kołakowska 2016, Lau 2018) and excluded from the safety-sensitive mood
  score; retained only as optional telemetry/ablation variables. `../decisions/`
- **Proposal revision** — problem framing softened to a supplementary support layer,
  novelty claims narrowed, fusion changed from three-way to two-way, FER and Sinhala-NLP
  claims made precise, human evaluation added, privacy protections strengthened.
- **Phase 1 system design** — all seven Master Plan Phase 1 deliverables authored.
- **Phase 1 gap-closure pass** (2026-08-19) — audited deliverables, found and wrote two
  missing specifications (mood state, safety policy), replaced 30 generated citation
  artifacts, derived the Gate 1A/1B model. `PHASE_1_CLOSURE.md`
- **Repository restructure** (2026-08-19) — 15 nested folders reduced to 4 top-level
  working folders; documentation consolidated; Markdown mirrors created for binary
  documents. No content deleted.

## 3. Phase 1 deliverable status

All seven Master Plan Phase 1 deliverables exist.

| Deliverable | Document | Status |
|---|---|---|
| `requirements.md` | `REQUIREMENTS.md` | Complete |
| `architecture.md` | `../system/SYSTEM_DESIGN.md` Part 1 | Complete |
| `api_contract.md` | `../system/SYSTEM_DESIGN.md` Part 3 | Complete |
| `local_storage_schema.md` | `../system/SYSTEM_DESIGN.md` Part 6 | Complete |
| `mood_state_specification.md` | `../system/MOOD_STATE_SPEC.md` | Part A frozen and **approved**; Part B open by design |
| `safety_policy.md` | `../system/SAFETY_POLICY.md` | Structure frozen; wording DRAFT pending ethics |
| `model_interfaces.md` | Label level in `MOOD_STATE_SPEC.md` §A4; tensor level at Phase 3 exit | Split |

## 4. Gate 1B — open, parallel to Phase 2

None of these block FER work.

| Item | Owner | Needed by |
|---|---|---|
| Safety policy sign-off, incl. Sinhala escalation wording | Supervisor + SLIIT IERC | Before human evaluation |
| Local storage feasibility spike and technology selection | Student | Before Phase 5 |
| Physical benchmark device named | Student | Before Phase 3 exit |
| Mock end-to-end verification | Student | Before Phase 5 |
| Citation diff review | Reviewer | Gate 1B |

Full checklist: `PHASE_1_CLOSURE.md` Part B.

## 5. Major decisions — baselines

Reversing any of these requires a new memo in `../decisions/`.

1. Core architecture is **face + bilingual text → fusion → adaptive chatbot** — two
   modalities, not three.
2. Typing speed and response delay are **permanently excluded** from core mood fusion.
3. FER runs **on-device**; raw facial frames are never stored or transmitted.
4. Camera sensing requires **explicit consent**; text-only fallback is mandatory.
5. The system is **not** a clinical diagnostic tool and must never claim a diagnosis.
6. Fusion weights must be **empirically justified**.
7. Sinhala performance is evaluated **separately** from English.
8. FER pipeline is **FER-2013 → MobileNetV2 transfer learning → fine-tuning → TFLite**,
   with **no separate baseline CNN**.
9. Face detection for mobile inference is **MediaPipe BlazeFace**.
10. Novelty is scoped to the **localized bilingual Sri Lankan pregnancy context** — not
    "first pregnancy chatbot", not "multimodal fusion is novel".
11. Adaptive response quality must be **evaluated with users**.
12. Experiment metadata is recorded **by the notebooks**, not by separate infrastructure.
13. **No medical knowledge base.** The chatbot provides emotional support only; factual
    pregnancy questions are acknowledged and redirected to a health professional.
    Information provision belongs to the teammates' clinical/nutrition components.
    See `../decisions/MEDICAL_KNOWLEDGE_BASE_DECISION.md`.

## 6. Open decisions

Deliberately open. **Do not close by assumption.**

| # | Open decision | Resolve at | Tracked in |
|---|---|---|---|
| OD-1 | Text-mood placement: on-device vs backend | Phase 4 exit | `../decisions/TEXT_MODEL_PLACEMENT_DECISION.md` |
| OD-2 | Local storage technology (T2 tier) | Before Phase 5 | `../decisions/LOCAL_STORAGE_DECISION.md` |
| OD-3 | LLM provider and model | Phase 6 | `../system/SYSTEM_DESIGN.md` Part 3 §13 |
| OD-4 | FER 7-class → 3-state mapping table | Phase 2 exit | `../system/MOOD_STATE_SPEC.md` §B2 |
| OD-5 | Text label space → 3-state mapping | Sentiment phase | `MOOD_STATE_SPEC.md` §B3 |
| OD-6 | Confidence thresholds `τ_face_min`, `τ_text_min`, `τ_fusion_min`, `τ_distress` | Phases 3, 4, 7 | `MOOD_STATE_SPEC.md` §B1 |
| OD-7 | Fusion weights `W_face`, `W_text` | Phase 7 exit | `MOOD_STATE_SPEC.md` §B1 |
| OD-8 | Temporal smoothing window `N_smooth` | Phase 3 exit | `MOOD_STATE_SPEC.md` §B1 |
| OD-9 | Performance engineering requirements and acceptance thresholds | Phases 3, 6, 11 | `../system/PERFORMANCE_BENCHMARK_PLAN.md` |
| OD-10 | Physical benchmark target device | Before Phase 3 exit | `PERFORMANCE_BENCHMARK_PLAN.md` §3 |
| OD-11 | Sinhala escalation wording and referral pathway | Before human evaluation | `../system/SAFETY_POLICY.md` §5.3–5.4 |

## 7. Registered empirical checkpoints

Questions the design leaves open for evidence to answer.

| # | Checkpoint | When | If it fails |
|---|---|---|---|
| CP-1 | Are `calm` and `neutral` separable by FER or text? | Phase 3 / 4 confusion matrices | Revise the mood spec to two substantive states + `unknown` via a memo. **Acceptable outcome.** |
| CP-2 | Does the FER 7→3 mapping collapse degenerately on FER-2013? | Phase 2 | Revisit the valence/arousal region boundaries before training |
| CP-3 | Does `τ_text_min` need separate values per language? | Phase 4 | Split the symbol |

## 8. Governance rules

1. **No invented values.** No accuracy, latency, threshold or weight may be written without
   a measurement. Use `TBD` with the producing phase.
2. **Nothing is deleted.** Superseded documents move to `../archive/` and are marked.
3. **Formal decisions are separate documents** in `../decisions/` and are never merged away.
4. **Behavioural signals stay out of fusion** unless a new memo reverses decision 2.
5. **No human participant contact** before SLIIT IERC approval.
6. **Claim boundaries hold** — see `../research/RESEARCH_GAPS.md` for what may and may not
   be claimed.
7. **Test sets are touched once.** Validation drives decisions.

## 9. Not permitted yet

- Human participant data collection (ethics approval outstanding)
- Deployment of any safety or escalation wording to users
- Fusion weight selection (Phase 7)
- Any claimed accuracy figure — none exists
- Production deployment

## 10. Continue reading

→ `../README.md` — documentation index
→ `../system/MOOD_STATE_SPEC.md` — required before model work
→ `BUILD_PLAN.md` — full 12-phase sequence
→ `PHASE_1_CLOSURE.md` — Phase 1 record and Gate 1B checklist
→ `../../ml/fer/README.md` — the active work
