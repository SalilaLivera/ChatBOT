# IT22638168 — MaternaLink Mood-Aware Conversational Support Component

**Author:** Livera S.D — IT22638168 · **Project:** R26-IT-146 · **Supervisor:** Dr. Kapila Dissanayake
**Institution:** SLIIT, BSc (Hons) Information Technology
**Current phase:** **PHASE 2 — Dataset and Model Development**

---

## 1. What this project is

A final-year research project building the **emotional-support component** of MaternaLink,
a pregnancy-support system for Sri Lanka. It is a bilingual (Sinhala/English) chatbot that
infers the user's emotional state from two signals, fuses them transparently, and adapts
its conversational tone accordingly.

Three other team members build the clinical, risk-monitoring and nutrition components
(IT22272386, IT22557506, IT22284716). This repository is **only** the mood-aware
conversational layer.

**It is a supportive tool, not a diagnostic or clinical system.** It must never claim a
user has depression, anxiety, or any clinical condition.

## 2. Architecture

```
   Camera frame                       Sinhala/English message
        │                                       │
        ▼                                       ▼
  MediaPipe BlazeFace                   Language detection
        │  face crop                            │
        ▼                                       ▼
  MobileNetV2 (TFLite, on-device)      Text mood model
  → 7 FER emotions                     → mood + confidence
        │                                       │
        └───────────────┬───────────────────────┘
                        ▼
              Transparent late fusion
              Fused(c) = W_face·Face(c) + W_text·Text(c)
                        ▼
          Mood state: calm | neutral | distressed | unknown
                        ▼
        Adaptive Response Policy  +  Deterministic Safety Layer
                        ▼
                      LLM
                        ▼
                    Chatbot response
```

Raw camera frames terminate at the FER inference boundary — they are never stored and
never transmitted.

## 3. The two core modalities

| Modality | Where it runs | Notes |
|---|---|---|
| **Facial expression** | On-device (TFLite) | FER-2013 → MobileNetV2 transfer learning → fine-tuning → TFLite. BlazeFace supplies the face crop. |
| **Sinhala/English text** | **Undecided** — on-device vs backend | Deliberately open; needs measured model size and latency. See `docs/decisions/TEXT_MODEL_PLACEMENT_DECISION.md`. |

## 4. Behavioural signal decision — important

**Typing speed and response delay are NOT part of the core mood fusion.**

The original proposal used three-way fusion (face + text + behaviour, behaviour weighted
~15%). The 49-paper literature review found behavioural affect signals are real but
strongly person-dependent, with effects small relative to individual variability — not
defensible as a fixed generic weight in a **safety-sensitive** score.

They may exist only as optional telemetry or ablation variables, and must never influence
the mood state or chatbot tone. Reversing this requires a new decision memo in
`docs/decisions/`.

Evidence: `docs/decisions/BEHAVIOURAL_SIGNAL_DECISION.md`.

## 5. Current phase and progress

### Completed
- **Literature review** — 49 papers extracted, gap matrix, existing-systems comparison
- **Proposal revision** — three-way fusion → two-way, novelty claims bounded
- **Phase 1 system design** — all seven master-plan deliverables written
- **Gate 1A** — ✅ **COMPLETE** (2026-08-19): supervisor approved the Mood State
  Specification, FER-2013 research use verified, experiment metadata handled by notebooks

### In progress — Phase 2
FER-2013 dataset preparation → MobileNetV2 transfer learning. Work happens in
`ml/fer/notebooks/`.

### Also open (parallel, non-blocking) — Gate 1B
Safety wording sign-off, storage feasibility spike, benchmark device naming, mock
end-to-end verification. Tracked in `docs/project/PHASE_1_CLOSURE.md`.

## 6. Repository structure

```
IT22638168/
├── README.md              ← you are here
├── docs/                  All project documentation
│   ├── project/           Status, build plan, requirements, proposal, register
│   ├── research/          Literature review, gaps, existing systems
│   ├── system/            Architecture, mood states, safety, performance
│   ├── decisions/         Formal decision memos
│   └── archive/           Superseded / duplicate material (nothing deleted)
├── ml/                    Machine-learning development
│   ├── fer/               Facial emotion recognition  ← ACTIVE
│   └── sentiment/         Sinhala/English text mood   ← later phase
├── dev/                   Application workspace
│   ├── backend/           API, chatbot orchestration, safety layer (empty)
│   └── frontend/          Mobile UI, camera, chat (empty)
└── experiments/           Consolidated cross-model results and reports
```

## 7. Where to look — reading order for an AI agent or new developer

```
README.md (this file)
      ↓
docs/README.md            → what documentation exists and which doc is authoritative
      ↓
docs/system/SYSTEM_DESIGN.md   → architecture, modules, API, privacy, storage, technology
docs/system/MOOD_STATE_SPEC.md → the four mood states (read before ANY model work)
      ↓
ml/README.md              → how ML work is organised and how runs are recorded
      ↓
ml/fer/README.md          → the FER pipeline and notebook order
      ↓
ml/fer/notebooks/         → the actual work
```

**Shortcuts by question:**

| Question | Read |
|---|---|
| What are the mood states and label space? | `docs/system/MOOD_STATE_SPEC.md` |
| What are the modules and APIs? | `docs/system/SYSTEM_DESIGN.md` |
| What must the chatbot never say? | `docs/system/SAFETY_POLICY.md` |
| What are the requirements? | `docs/project/REQUIREMENTS.md` |
| What phase are we in, what's next? | `docs/project/PROJECT_CONTROL.md` |
| What is the full build sequence? | `docs/project/BUILD_PLAN.md` |
| Why was a decision made? | `docs/decisions/` |
| What does the research say? | `docs/research/LITERATURE_REVIEW.md` |
| Where is every document? | `docs/project/DOCUMENT_REGISTER.md` |

## 8. Decisions already made (do not reverse without a memo)

1. Core modalities are **face + bilingual text** — two, not three.
2. Typing speed and response delay are **excluded** from core fusion.
3. FER runs **on-device**; raw frames are never stored or transmitted.
4. Camera sensing requires **explicit consent**; a text-only fallback is mandatory.
5. The system is **not** a clinical diagnostic tool.
6. Fusion weights must be **empirically justified**, never assumed.
7. Sinhala performance is evaluated **separately** from English.
8. FER pipeline is **FER-2013 → MobileNetV2 transfer learning → fine-tuning → TFLite**.
   There is **no separate baseline CNN**.
9. Face detection for mobile inference is **MediaPipe BlazeFace**.
10. Adaptive response quality must be **evaluated with users**, not assumed.

## 9. What is NOT yet decided — deliberately

These are open because the evidence to decide them does not exist yet. **Do not close them
by assumption.**

| Open item | Decided at | Tracked in |
|---|---|---|
| FER 7-class → 3-state mapping table | Phase 2 exit | `docs/system/MOOD_STATE_SPEC.md` §B2 |
| Text label space → 3-state mapping | Sentiment phase | `MOOD_STATE_SPEC.md` §B3 |
| Confidence thresholds `τ_face_min`, `τ_text_min`, `τ_fusion_min`, `τ_distress` | Phases 3, 4, 7 | `MOOD_STATE_SPEC.md` §B1 |
| Fusion weights `W_face`, `W_text` | Phase 7 experiment | `MOOD_STATE_SPEC.md` §B1 |
| Temporal smoothing window `N_smooth` | Phase 3 | `MOOD_STATE_SPEC.md` §B1 |
| Text model placement (device vs backend) | Phase 4 exit | `docs/decisions/TEXT_MODEL_PLACEMENT_DECISION.md` |
| Local storage technology | Before Phase 5 | `docs/decisions/LOCAL_STORAGE_DECISION.md` |
| LLM provider and model | Phase 6 | `SYSTEM_DESIGN.md` Part 3 §13 |
| Performance targets | Phases 3/6/11 | `docs/system/PERFORMANCE_BENCHMARK_PLAN.md` |
| Sinhala escalation wording | Before human evaluation | `docs/system/SAFETY_POLICY.md` §5.3 |

**No accuracy, latency, threshold or weight value may be invented.** If a number is needed
and no measurement exists, the correct action is to record `TBD` with the producing phase.

## 10. Immediate next actions

1. `ml/fer/notebooks/01_dataset_exploration.ipynb` — inspect FER-2013, class distribution, corrupt samples
2. Derive the **FER 7→3 mood mapping** using the AffectNet valence/arousal procedure in `MOOD_STATE_SPEC.md` §B2
3. `02_data_preparation.ipynb` — preprocessing, augmentation, leakage-free splits
4. `03_mobilenetv2_transfer_learning.ipynb` — frozen-backbone transfer learning
5. `04_mobilenetv2_fine_tuning.ipynb` — unfreeze and fine-tune

Do not start step 3 before step 2 is complete — the label mapping determines the model head.

## 11. Hard rules

- No human participant data collection before SLIIT IERC ethics approval.
- No raw facial frames stored, logged, or transmitted.
- No invented metrics, thresholds, or weights.
- No behavioural signals in the fusion engine.
- No clinical claims in any user-facing text.
