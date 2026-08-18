# Project Status — IT22638168

_Last updated: 2026-08-19 (Phase 1 gap-closure pass)_

## Current phase

**Phase 1 — System and Research Design** (per the Detailed Build Master Plan). Goal:
freeze technical and research design (requirements, mood-state definitions, model
interfaces, API contracts, storage schema, privacy flow, safety/escalation rules) before
implementation begins.

### Phase 1 deliverable status

All seven Master Plan Phase 1 deliverables now exist in `03_SYSTEM_DESIGN/`:

| Master-plan deliverable | Repository document | Status |
|---|---|---|
| `requirements.md` | `IT22638168_Functional_and_NonFunctional_Requirements.md` | Complete |
| `architecture.md` | `01_System_Architecture_Specification.md` | Complete |
| `api_contract.md` | `03_API_and_Data_Contract.md` | Complete |
| `local_storage_schema.md` | `IT22638168_Local_Storage_and_Data_Schema.md` | Complete |
| `mood_state_specification.md` | `IT22638168_Mood_State_Specification.md` | Part A frozen; Part B open by design |
| `safety_policy.md` | `IT22638168_Safety_Policy_and_Escalation_Specification.md` | Structure frozen; wording DRAFT pending ethics |
| `model_interfaces.md` | Label level in Mood State Spec §A4; tensor level deferred | Split — tensor spec due at Phase 3 exit |

### Gate model

Phase 1 closes in two gates, because Phase 2 depends on exactly one Phase 1 artefact.
See `IT22638168_Phase_1_Closure_Checklist.md` — the single gate authority.

| Gate | Contents | Effect |
|---|---|---|
| **Gate 1A** | Mood State Spec Part A approved; FER mapping procedure; dataset licensing verified; experiment structure | **Phase 2 may begin** |
| **Gate 1B** | Safety sign-off; storage spike; target device; mock E2E; governance | **Phase 1 formally closed** — runs in parallel with Phase 2 |

Neither gate is closed at time of writing.

## Completed phases / work

- **Literature review**: complete. 49 papers extracted and tiered
  (`02_LITERATURE_REVIEW/paper_extraction/`), gap matrix produced
  (`02_LITERATURE_REVIEW/research_gaps/`), existing-systems comparison produced
  (`02_LITERATURE_REVIEW/existing_systems/`), full review document written
  (`02_LITERATURE_REVIEW/final/`).
- **Architecture decision — behavioural signals removed from core fusion**: complete.
  Typing speed and response delay were evaluated against the literature (Epp 2011, Lee
  2015, Ghosh 2019, Eisele 2021, Kołakowska 2016, Lau 2018) and excluded from the
  safety-sensitive mood score; retained only as optional telemetry/ablation variables.
  See `00_PROJECT_CONTROL/decisions/`.
- **Proposal revision**: complete. The original March 2026 proposal was revised in light
  of the completed literature review — problem framing softened to a supplementary
  support layer, novelty claims narrowed, fusion changed from three-way (face + text +
  behaviour) to two-way (face + bilingual text), FER and Sinhala-NLP claims made more
  precise, human evaluation of adaptive responses added, privacy protections
  strengthened. Full itemized reasoning in
  `00_PROJECT_CONTROL/change_log/IT22638168_Proposal_Revision_Change_Log.docx`.
- **Repository reorganization**: complete (this pass). All source documents inventoried,
  compared by checksum and content, and placed into the structure documented in the root
  `README.md` and `DOCUMENT_REGISTER.md`. No content was created, deleted, or rewritten —
  only moved, and renamed where necessary to disambiguate two genuinely different
  documents that shared a filename.

- **Phase 1 gap-closure pass**: complete (2026-08-19). Audited the seven Master Plan Phase 1
  deliverables against the repository and found two missing (`mood_state_specification.md`,
  `safety_policy.md`) and one partial (`model_interfaces.md`). Authored the missing
  specifications, the performance benchmark plan, and two decision memos; replaced 30
  generated citation artifacts with resolvable references across seven design documents;
  derived the Gate 1A/1B model from actual document dependencies. Full analysis in
  `IT22638168_Phase_1_Gap_Closure_Plan.md`.

## Next phase

**Immediate**: close Gate 1A — supervisor approval of Mood State Specification Part A,
dataset licence verification, and the experiment/reproducibility structure. That unblocks
**Phase 2 — Dataset and Data Pipeline Preparation**.

**In parallel**: close Gate 1B — safety policy sign-off, storage feasibility spike, target
device, mock end-to-end verification, and governance updates.

Outstanding items are tracked in `IT22638168_Phase_1_Closure_Checklist.md`.

## Major decisions (already made)

1. Core architecture is **face + bilingual (Sinhala/English) text → mood fusion →
   adaptive chatbot** — a two-modality system, not three.
2. Typing speed and response delay are excluded from the core mood-fusion score
   permanently, unless a future decision explicitly reverses this (would require a new
   entry in `00_PROJECT_CONTROL/decisions/`).
3. The project does not claim "first pregnancy chatbot" or that face+text fusion is
   itself novel — novelty is scoped to the localized bilingual + Sri Lankan pregnancy
   context, per the research-gap matrix.

## Open decisions

Recorded 2026-08-19 by the Phase 1 gap-closure pass. Each is deliberately open, with a
named owner phase — none blocks Phase 2.

| # | Open decision | Why deferred | Resolve at | Record in |
|---|---|---|---|---|
| OD-1 | M4 text-mood placement: on-device vs backend | Needs measured model size and latency that do not exist until Phase 4 | Phase 4 exit | `decisions/IT22638168_Text_Model_Placement_Decision_Memo.md` |
| OD-2 | Local storage technology for the T2 tier | Needs a feasibility spike on the physical target device | Before Phase 5 | `decisions/IT22638168_Local_Storage_Decision_Memo.md` |
| OD-3 | LLM provider and model | Cost, latency, Sinhala quality and safety controls not yet benchmarked | Phase 6 | `03_API_and_Data_Contract.md` §13 |
| OD-4 | FER 7-class → 3-state mapping table | Requires the AffectNet valence/arousal analysis pass | Phase 2 exit | Mood State Spec §B2 |
| OD-5 | Text label space → 3-state mapping | Polarity ≠ affective-support axis; requires annotation study | Phase 2 exit (labels), Phase 4 exit (adaptation method) | Mood State Spec §B3 |
| OD-6 | Confidence thresholds `τ_face_min`, `τ_text_min`, `τ_fusion_min`, `τ_distress` | Require validation data | Phases 3, 4, 7 | Mood State Spec §B1 |
| OD-7 | Fusion weights `W_face`, `W_text` | Must be empirically justified; Master Plan forbids arbitrary weighting | Phase 7 exit | Mood State Spec §B1 |
| OD-8 | Temporal smoothing window `N_smooth` | Requires the Phase 3 smoothing experiment | Phase 3 exit | Mood State Spec §B1 |
| OD-9 | Performance engineering requirements and acceptance thresholds | No model exists to measure | Phase 3 / 6 / 11 | `IT22638168_Performance_Benchmark_Plan.md` |
| OD-10 | Physical benchmark target device | Not yet secured | Before Phase 3 exit | `IT22638168_Performance_Benchmark_Plan.md` §3 |
| OD-11 | Sinhala escalation wording and referral pathway | Requires language/cultural review and ethics approval | Before human evaluation | Safety Policy §5.3, §5.4 |

## Registered empirical checkpoints

These are questions the design deliberately leaves open for evidence to answer.

| # | Checkpoint | When | If it fails |
|---|---|---|---|
| CP-1 | Are `calm` and `neutral` separable by FER or text in real conditions? | Phase 3 and Phase 4 confusion matrices | Revise Mood State Spec to two substantive states + `unknown` via a decision memo. This is an acceptable outcome. |
| CP-2 | Does the FER 7→3 mapping collapse degenerately on FER-2013? | Phase 2 | Revisit the valence/arousal region boundaries before training |
| CP-3 | Does `τ_text_min` need separate values per language? | Phase 4 | Split the symbol |

## Important constraints

- Behavioural telemetry (if retained) must never drive the safety-sensitive chatbot mood
  state — evaluation only, against participant self-report, as an exploratory/ablation
  analysis.
- Sinhala NLP claims must acknowledge it as low-resource-but-advancing, not absent.
- Any broader-database novelty claim (e.g. "first" or "unique") requires a systematic
  search beyond what has been completed so far — flagged as moderate confidence in the
  detailed behavioural-signal decision memo.
- Privacy: consent, visible camera state, raw-frame disposal, and a text-only fallback
  are required design constraints for Phase 1 (per the proposal revision change log).

## Current architecture

```
Facial Emotion Recognition (FER) + Bilingual (Sinhala/English) Text Sentiment
                              ↓
                        Mood Fusion (two-way, transparent, empirically-tuned weights)
                              ↓
                       Adaptive Chatbot Response

(Typing speed / response delay: optional telemetry only — does not feed the fusion step)
```
