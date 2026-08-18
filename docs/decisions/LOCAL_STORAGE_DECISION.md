# IT22638168 — Local Storage Decision Memo

**Status:** Tier assignment **[PROPOSED]** for approval; technology selection `UNRESOLVED — resolve after feasibility spike, before Phase 5`
**Date opened:** 2026-08-19
**Subject:** Reconciling the AsyncStorage reference with the prohibition on unencrypted key-value storage for sensitive conversation data.

---

## 1. The contradiction

Two project documents currently disagree:

| Document | Statement |
|---|---|
| Proposal §3.3 (Tools and Platforms) | "…**AsyncStorage** for local data…" |
| `IT22638168_Local_Storage_and_Data_Schema.md` §11 | "**Do not use ordinary unencrypted key-value storage for sensitive conversation data.**" |

Left unreconciled, an implementer would follow whichever document they read first.

## 2. Resolution: the contradiction is a category error, not a conflict

The two statements are only in conflict if "local data" is treated as one undifferentiated
class. It is not. The storage schema already classifies its entities by sensitivity
(§2, Data Classification), and that classification resolves the dispute directly:

> **AsyncStorage is acceptable for some of the schema's entities and not for others.**

The decision required is therefore **not** "which single storage technology", but **a tier
assignment across the entities that already exist**. This requires no schema redesign, and
the entities and retention rules in `IT22638168_Local_Storage_and_Data_Schema.md` remain
frozen exactly as written.

## 3. Proposed tier assignment **[PROPOSED]**

Entities are those already defined in the storage schema §3–§8. Sensitivity ratings are
those already assigned in schema §2.

| Tier | Entities | Requirement | Basis |
|---|---|---|---|
| **T0 — Never persisted** | Raw camera frame | Memory-only; released after inference | **[DOCUMENTED]** schema §9 — no entity exists by design; FR-09; Master Plan §17.4 |
| **T1 — Secure platform storage** | Any client-side secrets, API keys, tokens; encryption key material | Platform keystore; never the filesystem, never hardcoded | **[DOCUMENTED]** schema §14; MASVS-CRYPTO key-management guidance |
| **T2 — Encrypted, database-style** | `Conversation`, `Message`, `MoodSummary`, `ConsentState` | At-rest protection + query capability + migration support | schema §2 (High sensitivity), §11 (versioning/migrations), §13 (deletion) |
| **T3 — Ordinary preferences** | `UserSettings`, `SavedContent` | AsyncStorage-class storage is acceptable | schema §2 rates these Low/Low-medium |

### 3.1 Why `ConsentState` is T2 and not T3 **[PROPOSED]**

The schema rates `ConsentState` "Medium/high" and it is small and key-value shaped, so T3
looks natural. It is placed in T2 anyway because:

- it is **versioned** (`consent_version`) and carries `granted_at` / `withdrawn_at` —
  withdrawal is an auditable event, and silently losing it would misrepresent the user's choice;
- consent state gates camera processing (M2: "Prevent model execution before required
  consent"), so its integrity is a privacy control, not a preference;
- the ethics protocol depends on consent being demonstrable.

The cost of putting it in T2 is negligible; the cost of losing or corrupting it is not.

### 3.2 Reconciliation statement

> The Proposal's AsyncStorage reference is **correct for T3 entities** (`UserSettings`,
> `SavedContent`) and **superseded for T2 entities** (`Conversation`, `Message`,
> `MoodSummary`, `ConsentState`), which require encrypted database-style storage per
> storage schema §11 and §14.

This reconciliation is to be reflected as a pointer in storage schema §11. The Proposal
itself is a submitted academic document and is **not** retro-edited; the supersession is
recorded here and in `PROJECT_STATUS.md`.

## 4. Technology selection — `UNRESOLVED`

### 4.1 Selection criteria — and what is explicitly excluded

Candidates for the T2 tier are evaluated **only** against:

| Criterion | Requirement |
|---|---|
| Expo / React Native compatibility | Must build under the project's chosen workflow (Technology and Model Selection §2 permits a development build/prebuild if needed) |
| At-rest encryption | Sensitive data encrypted at rest |
| Key custody | Key material held in the platform keystore, **not** the filesystem, **not** hardcoded (schema §14) |
| Query capability | Sufficient for the history screen and mood summaries |
| Migration support | Schema versioning/migrations required by schema §11 and Backlog Sprint 3 |
| Deletion completeness | Clear-history must remove data including journal/WAL files, caches, and backups (schema §13) |
| Maintenance burden | Sustainable for a single-developer research project |

**Explicitly excluded as a criterion: popularity, download counts, or blog consensus.**
Recorded because it is the most likely failure mode of this decision. Technology and Model
Selection §11 already forbids freezing a technology merely because it is named or convenient.

### 4.2 Feasibility spike — **[EVIDENCE REQUIRED]**

This is not a literature question. It must be **run** on the named target device before the
technology is selected.

| # | Check | Pass condition |
|---|---|---|
| 1 | Builds under the project's Expo/React Native configuration | Builds and runs on the physical target device |
| 2 | Key custody | Key material verifiably in the platform keystore; no key on the filesystem; no key in source |
| 3 | Insert/query performance at realistic history volume | Acceptable on the target device — volume defined at spike time, not assumed |
| 4 | Schema migration | A version bump applies cleanly without data loss |
| 5 | Deletion completeness | After clear-history, no residue in DB, journal/WAL, caches, temp files, or device backup (schema §13 leakage paths) |
| 6 | T3 coexistence | AsyncStorage-class storage for `UserSettings` / `SavedContent` coexists without leaking T2 data into it |

Check 5 is the one most likely to be skipped and is the one schema §13 and §15 explicitly
require. It must produce recorded evidence, not an assertion.

### 4.3 Timing

**Not a Phase 2/3/4 blocker.** No dataset, FER, or text-model artefact touches local
storage. The decision is required **before Phase 5 (Mobile Application Development)**
begins, and the spike is scheduled in the Gate 1B window so Phase 5 is not held up.

## 5. What must never be stored — restated

**[DOCUMENTED]**, restated because it is the project's hardest constraint:

- **Raw facial frames** — not persisted, not transmitted, no entity in the schema
  (schema §9; FR-08; FR-09; Master Plan §17.4).
- Full sensitive conversations in **logs** (privacy architecture §7; NFR-03).
- Secrets, tokens, API keys in ordinary storage or source (schema §14).
- Research participant data mixed with production app data (schema §10; Module Spec §13).

## 6. Acceptance criteria

- [ ] Tier table (§3) approved by supervisor
- [ ] `ConsentState` T2 placement approved
- [ ] Reconciliation statement (§3.2) reflected in storage schema §11
- [ ] Feasibility spike executed on the named physical target device
- [ ] All six spike checks recorded with evidence, including deletion completeness
- [ ] Keystore key custody verified, not assumed
- [ ] Technology selected against §4.1 criteria with recorded reasoning
- [ ] Decision recorded in §7 and in `PROJECT_STATUS.md`

## 7. Decision

> **Tier assignment: PROPOSED, pending supervisor approval.**
>
> **Technology selection: UNRESOLVED — resolve after the §4.2 spike, before Phase 5 begins.**
>
> When resolved, record the selected technology and the spike evidence here, and update
> storage schema §11.

## References

- Local Storage and Data Schema §2, §9, §11, §13, §14, §15 — `docs/system/SYSTEM_DESIGN.md (Part 6)`
- Data, Privacy and Safety Architecture §6, §7 — `docs/system/SYSTEM_DESIGN.md (Part 4)`
- Technology and Model Selection §2, §8, §11 — `docs/system/SYSTEM_DESIGN.md (Part 5)`
- Phase 1 Implementation Backlog, Sprint 3 — `docs/project/`
- Proposal §3.3 — `docs/project/IT22638168_Proposal_FINAL.docx`
