# dev/ — Application Development Workspace

**Status:** Empty scaffold. Nothing is implemented and nothing should be yet.

This folder exists so the structure is visible. Application development begins at Build
Plan Phase 5 (mobile) and Phase 6 (backend) — **after** the models exist.

> **Do not implement anything here just because the folders exist.**
> The current active work is `../ml/fer/`.

## Layout

| Folder | Eventually contains |
|---|---|
| `backend/` | Chat API, chatbot orchestration, safety layer, LLM integration, integration gateway |
| `frontend/` | Mobile UI, camera interface, chat interface, consent/privacy controls, settings, supportive content |

## backend/ — when Phase 6 begins

Proposal-aligned stack: **Node.js + Express**.

Responsibilities (`docs/system/SYSTEM_DESIGN.md` Part 2, modules M6–M8, M11):

- request validation and versioned API routing
- structured mood context handling
- LLM orchestration **behind a provider-independent boundary**
- deterministic safety layer
- adaptive response policy
- integration gateway to the wider MaternaLink system

Contracts are already specified in `docs/system/SYSTEM_DESIGN.md` Part 3. Build to that
contract; do not invent endpoints.

### Two constraints that shape the backend

1. **The safety layer must not depend on the LLM.** Deterministic checks run on our side of
   the provider boundary, on every message, regardless of mood state. See
   `docs/system/SAFETY_POLICY.md` §1.
2. **The LLM provider is not selected.** M6 and M8 must not import provider SDK types.
   Prompt templates and safety wording are versioned project assets, not provider config.
   See `SYSTEM_DESIGN.md` Part 3 §13.

## frontend/ — when Phase 5 begins

Proposal-aligned stack: **React Native + Expo**.

Screens (`docs/project/BUILD_PLAN.md` Phase 5):

```
Welcome / Consent → Home → Chat → History → Settings / Privacy
                              ├── camera permission
                              ├── mood sensing state
                              └── supportive content
```

### Non-negotiable UI constraints

- Camera sensing requires **explicit consent** and a **visible active state**.
- Camera can be disabled at any time; **text-only mode must fully work** (FR-01, FR-06, NFR-06).
- Sinhala and English must both render correctly, everywhere — chat, consent, settings,
  errors, content labels (NFR-10).
- **Raw camera frames are never stored or transmitted.** They terminate at the FER
  inference boundary.
- Mood is never presented as a diagnosis.

## Storage — decide before starting frontend

Local storage technology is **not yet selected**. The entity tiering is proposed and a
feasibility spike is required first — see `docs/decisions/LOCAL_STORAGE_DECISION.md`.

Summary: `UserSettings` and `SavedContent` may use AsyncStorage-class storage;
`Conversation`, `Message`, `MoodSummary` and `ConsentState` require encrypted
database-style storage with keys held in the platform keystore.

**Do not start frontend persistence work before that spike runs.**

## What belongs here

Application source code, configuration, build files, application tests.

## What does NOT belong here

- Model training code and notebooks → `../ml/`
- Specifications → `../docs/`
- Experiment results → `../experiments/`

## Prerequisites before this folder becomes active

| Prerequisite | Status |
|---|---|
| FER model trained and exported to TFLite | Not started (Phase 3) |
| Local storage technology selected | Open — spike required |
| Target Android device named | Open |
| Safety wording approved by ethics | Open — DRAFT only |
| Expo/camera and TFLite integration paths verified | Open (Sprint 8) |

## Continue reading

→ `../docs/system/SYSTEM_DESIGN.md` — architecture, modules, API contract
→ `../docs/system/SAFETY_POLICY.md` — what the chatbot must never do
→ `../docs/project/BUILD_PLAN.md` Phases 5 and 6
