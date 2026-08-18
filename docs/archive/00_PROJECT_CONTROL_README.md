# 00_PROJECT_CONTROL

Project-wide control documents that span more than one phase (proposal, literature
review, and future build phases). If a document is specific to one phase only, it lives
in that phase's own folder instead (e.g. `02_LITERATURE_REVIEW/decisions/` for the
literature-review-specific version of the behavioural-signal memo).

- **`master_plan/`** — the canonical build master plan governing all development phases.
- **`decisions/`** — cross-cutting architecture decisions that affect more than one
  phase (currently: the behavioural-signal removal decision, which affects both the
  literature review's gap framing and the proposal's fusion design).
- **`change_log/`** — the record of what changed between major document revisions and why.
- **`DOCUMENT_REGISTER.md`** — full inventory of every document in the project: location,
  type, status, version, and purpose.
- **`PROJECT_STATUS.md`** — current phase, completed work, next phase, and open decisions.
