# docs/ — Project Documentation

All project documentation lives here. Nothing outside `docs/` is documentation.

## Purpose

This folder holds the authoritative record of **what is being built, why, and what has been
decided**. Code lives in `ml/` and `dev/`; results live in `experiments/`.

## Structure

| Folder | Contains |
|---|---|
| `project/` | Status, build plan, requirements, proposal, document register |
| `research/` | Literature review, research gaps, existing-systems comparison |
| `system/` | Architecture, mood states, safety policy, performance protocol |
| `decisions/` | Formal decision memos — why a choice was made |
| `archive/` | Superseded, duplicate and historical material. **Nothing is ever deleted.** |

## The documents that matter most

Read these four and you understand the project:

| Document | Why |
|---|---|
| `system/MOOD_STATE_SPEC.md` | The four mood states and the label space. **Read before any model work** — the FER label mapping depends on it. |
| `system/SYSTEM_DESIGN.md` | Architecture, modules M1–M12, API contract, privacy, storage, technology. One consolidated specification. |
| `project/PROJECT_CONTROL.md` | Current phase, what is done, what is open, governance rules. |
| `project/BUILD_PLAN.md` | The full 12-phase build sequence. |

## Also here

| Document | Purpose |
|---|---|
| `system/SAFETY_POLICY.md` | Safety categories, deterministic detection, escalation wording (DRAFT, pending ethics) |
| `system/PERFORMANCE_BENCHMARK_PLAN.md` | How performance is measured. Contains no values by design. |
| `project/REQUIREMENTS.md` | FR-01–FR-25, NFR-01–NFR-15 |
| `project/PHASE_1_CLOSURE.md` | Phase 1 gap analysis, gate checklist, sprint backlog |
| `project/DOCUMENT_REGISTER.md` | Every document, its location, status and authority |
| `research/LITERATURE_REVIEW.md` | The 49-paper synthesis |
| `research/RESEARCH_GAPS.md` | The gap matrix with claim boundaries |

## What belongs here

- Specifications, plans, decisions, research synthesis, status records.
- Both authoritative binaries (`.docx`, `.xlsx`, `.pdf`) and their Markdown mirrors.

## What does NOT belong here

- Code, notebooks, models, datasets → `ml/` or `dev/`
- Experiment results and metrics → `experiments/` or `ml/*/outputs/`
- Trained model files → `ml/*/models/`

## Markdown mirrors — read these, not the binaries

Several authoritative documents are Word or Excel files, which an AI agent cannot read.
Each has a faithful Markdown mirror alongside it. **The binary remains authoritative for
submission; the mirror exists so the content is readable.** Content is identical.

| Mirror | Authoritative source |
|---|---|
| `project/PROPOSAL.md` | `project/IT22638168_Proposal_FINAL.docx` |
| `project/PROPOSAL_CHANGE_LOG.md` | `project/Proposal_Revision_Change_Log.docx` |
| `research/LITERATURE_REVIEW.md` | `research/IT22638168_Literature_Review_FINAL.docx` |
| `research/RESEARCH_GAPS.md` | `research/IT22638168_Research_Gap_Matrix_FINAL.xlsx` |
| `research/EXISTING_SYSTEMS.md` | `research/IT22638168_Existing_Systems_Comparison.xlsx` |
| `decisions/BEHAVIOURAL_SIGNAL_DECISION.md` | `decisions/Behavioural_Signal_Decision_Memo_FINAL.docx` |

If you edit a mirror, update its source too — or the two will disagree.

## Rules

1. **Formal decisions stay separate.** Decision memos in `decisions/` are individual
   records and are never merged into other documents.
2. **Nothing is deleted.** Superseded material moves to `archive/` and is marked.
3. **No invented values.** Where a number is not yet measured, write `TBD` with the phase
   that will produce it.
4. **Do not add folders per document.** Related documents live side by side in one of the
   five folders above.

## Current status

Phase 1 design documentation is complete. Gate 1A closed 2026-08-19. Gate 1B items
(safety sign-off, storage spike, benchmark device, mock E2E) remain open and are tracked in
`project/PHASE_1_CLOSURE.md`.

## Continue reading

→ `system/MOOD_STATE_SPEC.md` if you are about to do model work
→ `project/PROJECT_CONTROL.md` if you want current status
→ `../ml/README.md` if you are writing code
