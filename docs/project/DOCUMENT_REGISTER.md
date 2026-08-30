# IT22638168 — Document Register

Complete inventory of every document, after the 2026-08-19 repository restructure.

**Legend — Status**
`AUTHORITATIVE` single source of truth · `MIRROR` faithful Markdown copy of an
authoritative binary · `SUPPORTING` secondary/condensed version · `ARCHIVED` superseded,
duplicate or historical — retained, never deleted.

---

## docs/project/ — status, plan, requirements, proposal

| Document | Purpose | Status |
|---|---|---|
| `PROJECT_CONTROL.md` | Current phase, completed work, open decisions, governance rules | **AUTHORITATIVE** |
| `BUILD_PLAN.md` | The 12-phase build sequence. Formerly `IT22638168_Detailed_Build_Master_Plan.md` | **AUTHORITATIVE** |
| `REQUIREMENTS.md` | FR-01–FR-25, NFR-01–NFR-15 | **AUTHORITATIVE** |
| `PHASE_1_CLOSURE.md` | Phase 1 gap analysis, gate checklist, sprint backlog. Consolidates three former documents | **AUTHORITATIVE** |
| `DOCUMENT_REGISTER.md` | This file | **AUTHORITATIVE** |
| `IT22638168_Proposal_FINAL.docx` / `.pdf` | Revised proposal, post-literature-review | **AUTHORITATIVE** |
| `PROPOSAL.md` | Markdown mirror of the proposal | MIRROR |
| `IT22638168_Proposal_Presentation_FINAL.pptx` | Proposal slide deck | **AUTHORITATIVE** |
| `Proposal_Revision_Change_Log.docx` | Itemised original→revised proposal changes and reasons | **AUTHORITATIVE** |
| `PROPOSAL_CHANGE_LOG.md` | Markdown mirror of the change log | MIRROR |
| `verify_docs.py` | Automated documentation invariant checks. Formerly `verify_phase1_invariants.py` | Tooling |

## docs/research/ — literature and gap analysis

| Document | Purpose | Status |
|---|---|---|
| `IT22638168_Literature_Review_FINAL.docx` | The complete 49-paper literature review | **AUTHORITATIVE** |
| `LITERATURE_REVIEW.md` | Markdown mirror of the above | MIRROR |
| `IT22638168_Research_Gap_Matrix_FINAL.xlsx` | Gap matrix, 11 gaps, with citation-evidence codes and claim boundaries | **AUTHORITATIVE** |
| `RESEARCH_GAPS.md` | Markdown mirror of the gap matrix | MIRROR |
| `IT22638168_Existing_Systems_Comparison.xlsx` | Comparison against Moment for Parents, MomConnect, Woebot, Wysa and others | **AUTHORITATIVE** |
| `EXISTING_SYSTEMS.md` | Markdown mirror of the comparison | MIRROR |
| `IT22638168_Paper_Extraction_Sheet_FINAL.xlsx` | The 49 extracted paper records | **AUTHORITATIVE** |
| `IT22638168_Literature_Review_Master_Plan.docx` / `.pdf` | Methodology governing how the review was conducted | **AUTHORITATIVE** |
| `IT22638168_Literature_Review_Summary.docx` | Condensed review written for the proposal narrative | SUPPORTING |
| `IT22638168_Research_Gap_Matrix_ProposalSummary.xlsx` | Shortened 8-gap matrix for the proposal audience | SUPPORTING |

> The gap matrix and the behavioural-signal memo each exist in two forms — a detailed
> literature-review version and a condensed proposal-facing version. This is intentional
> and serves different audiences; it is not duplication.

## docs/system/ — technical specification

| Document | Purpose | Status |
|---|---|---|
| `SYSTEM_DESIGN.md` | Consolidated specification: architecture, modules M1–M12, API contract, privacy/safety architecture, technology selection, storage schema. Merges six former documents | **AUTHORITATIVE** |
| `MOOD_STATE_SPEC.md` | The four mood states, mood/safety separation, evidence contract, missing-modality rules, parameter register. Part A frozen and supervisor-approved; Part B open by design | **AUTHORITATIVE** |
| `SAFETY_POLICY.md` | Safety categories SC-01–SC-08, deterministic detection, escalation templates. Structure frozen; **all wording is DRAFT pending ethics review** | **AUTHORITATIVE** |
| `PERFORMANCE_BENCHMARK_PLAN.md` | Measurement protocol and device policy discharging NFR-08. Contains no values by design | **AUTHORITATIVE** |

### Documents merged into `SYSTEM_DESIGN.md`

Content preserved verbatim; heading levels shifted only.

| Former document | Now |
|---|---|
| `01_System_Architecture_Specification.md` | Part 1 |
| `02_Module_and_Submodule_Specification.md` | Part 2 |
| `03_API_and_Data_Contract.md` | Part 3 |
| `04_Data_Privacy_and_Safety_Architecture.md` | Part 4 |
| `05_Technology_and_Model_Selection.md` | Part 5 |
| `IT22638168_Local_Storage_and_Data_Schema.md` | Part 6 |

## docs/decisions/ — formal decision memos

Decision memos are **never merged**. Each records an actual project decision.

| Document | Decision | Status |
|---|---|---|
| `Behavioural_Signal_Decision_Memo_FINAL.docx` | Remove typing speed and response delay from core mood fusion. Project-facing condensed version | **AUTHORITATIVE** — DECIDED |
| `BEHAVIOURAL_SIGNAL_DECISION.md` | Markdown mirror of the above | MIRROR |
| `Behavioural_Signal_Decision_Memo_DETAILED.docx` | Same decision with full evidence review (Epp 2011, Lee 2015, Ghosh 2019, Eisele 2021, Kołakowska 2016, Lau 2018) | **AUTHORITATIVE** companion |
| `TEXT_MODEL_PLACEMENT_DECISION.md` | M4 on-device vs backend. Criteria and tie-break pre-registered | **UNRESOLVED** — due Phase 4 exit |
| `MEDICAL_KNOWLEDGE_BASE_DECISION.md` | No medical knowledge base, no RAG. The chatbot is emotional support only; factual questions are redirected to a health professional. Information provision belongs to teammates' clinical/nutrition components. | **AUTHORITATIVE** — DECIDED (rejected) |
| `LOCAL_STORAGE_DECISION.md` | Entity tiering T0–T3; reconciles the AsyncStorage contradiction | Tiering **PROPOSED**; technology **UNRESOLVED** — due before Phase 5 |

## docs/archive/ — retained, not active

Nothing here is current. Nothing was deleted.

| Document | Why archived |
|---|---|
| `Proposal_Package_ORIGINAL_March2026.docx` / `.pdf` | Original proposal, superseded by the revised proposal after the literature review |
| `PROJECT_STATUS_superseded_2026-08-19.md` | Superseded by `../project/PROJECT_CONTROL.md` |
| `00_PROJECT_CONTROL_README.md` | Folder guide for a folder that no longer exists after restructure |
| `PROPOSAL_original_NOTE.md` | Pointer note to the archived original proposal; now redundant |
| `Literature_Review_Master_Plan_DUPLICATE.docx` | Byte-identical duplicate of the canonical master plan |
| `Paper_Extraction_Sheet_SOURCE_COPY_DUPLICATE.xlsx` | Byte-identical duplicate of the blank template |
| `Paper_Extraction_Sheet_BLANK_TEMPLATE.xlsx` | Empty template preceding the completed 49-record sheet |
| `IT22638168_Literature_Review_Package.zip` | Original release bundle; contents extracted and distributed |
| `IT22638168_Updated_Proposal_Package.zip` | Original release bundle; contents extracted and distributed |
| `Updated_Proposal_Package_README.txt` | Original package manifest; content folded into the root README |
| `note_EMPTY.ipynb` | Empty 0-byte notebook from the repository root |

## Code and workspace folders

| Location | Contents | Status |
|---|---|---|
| `ml/fer/` | FER development — notebooks 01–08, data, models, plots, outputs | **ACTIVE** — Phase 2 |
| `ml/sentiment/` | Text mood development | Scaffold — later phase |
| `dev/backend/` | API, chatbot orchestration, safety layer | Empty scaffold — Phase 6 |
| `dev/frontend/` | Mobile UI, camera, chat | Empty scaffold — Phase 5 |
| `experiments/` | Cross-model consolidated results and reports | Empty — no results exist |

## Restructure record — 2026-08-19

- 15 nested folders reduced to **4 top-level working folders** (`docs/`, `ml/`, `dev/`, `experiments/`).
- 33 files moved with MD5 checksums verified identical before and after.
- 6 system-design documents consolidated into `SYSTEM_DESIGN.md`; 3 Phase 1 documents
  consolidated into `PHASE_1_CLOSURE.md`. Both verified line-by-line for content loss —
  every source line present.
- 6 Markdown mirrors generated so binary documents are readable by an AI agent.
- **No document content was deleted, reworded, or rewritten.** Consolidation shifted
  heading levels only.

## Rules

1. Every new document is added to this register.
2. Superseded documents move to `docs/archive/` and are recorded above — never deleted.
3. Formal decision memos remain separate documents.
4. Where a binary is authoritative, its Markdown mirror must be regenerated if the binary
   changes, or the two will disagree.
