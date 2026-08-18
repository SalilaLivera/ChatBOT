# IT22638168 — Text Model Placement Decision Memo

**Status:** `UNRESOLVED — resolve at Phase 4 exit`
**Date opened:** 2026-08-19
**Subject:** Should M4 (Bilingual Text Mood) inference run on-device or on the backend?
**Type:** Decision *procedure*, pre-registered. This memo does not contain the decision.

---

## 1. What is unresolved

`02_Module_and_Submodule_Specification.md` §1 records M4 as running on
"Device/backend depending final benchmark". No benchmark exists, so no decision exists.

| Option | Path |
|---|---|
| **A — On-device** | Mobile → local text model → mood result |
| **B — Backend** | Mobile → `POST /api/v1/mood/text` → backend model → mood result |

## 2. Why this is deferred rather than decided now

**This is not a Phase 1 blocker, and deciding it now would require inventing evidence.**

1. The deciding inputs are *measurements* — Sinhala model size, on-device latency,
   quantization quality loss — and no model exists to measure until Phase 4.
2. The API contract is already **placement-agnostic**: `POST /api/v1/mood/text`
   (`03_API_and_Data_Contract.md` §3) defines the same request/response shape regardless of
   where inference happens, and the Mood State Specification §A4 fixes the evidence contract
   independently of location.
3. Nothing in Phase 2 (dataset preparation) or Phase 3 (FER) changes based on placement.
4. Backlog Sprint 6 requires the text *contract* to be frozen, not the text *placement*.
   The contract is frozen; the placement is not.

**Deferral is therefore safe** provided the pre-registration in §4 is honoured, so the
decision is made against fixed criteria rather than rationalised after the measurements
arrive.

## 3. Criteria

Only project-relevant criteria. Each row states which option it favours and why.

| Criterion | Favours | Reasoning |
|---|---|---|
| **Privacy** | *Neither, decisively* | See §3.1 — this is the criterion most likely to be misapplied. |
| **Sinhala capability** | B (backend) | Backend removes the size ceiling, permitting larger Sinhala-capable models. Sinhala is the weaker language and the project's stated risk (Proposal Appendix C, R4). |
| **Model size / mobile feasibility** | A | A second on-device model runs alongside the TFLite FER model; combined footprint matters on a mid-range device. |
| **Latency** | *Measure both* | On-device avoids network RTT; backend may run a faster model on better hardware. Not decidable by argument. |
| **Offline operation** | A | But bounded — see §3.2. |
| **Implementation complexity** | B | Avoids a second on-device inference runtime alongside TFLite, and avoids mobile-side model distribution and updates. |
| **Backend requirements** | A | B adds a served model, its scaling, and its availability to the backend's responsibilities. |
| **Research / evaluation** | A | Removes network variance from reported text-inference latency (NFR-08), simplifying reproducibility (NFR-12). |

### 3.1 The privacy criterion does not decide this — recorded explicitly

**Privacy is the decisive criterion for FER. It is not decisive for text mood.**

The FER case is asymmetric: raw facial frames would otherwise leave the device, and the
project baseline forbids that (Master Plan §17.4, FR-08, FR-09). On-device FER genuinely
removes a data flow.

The text case is not asymmetric: **the user's message already transits to the backend** so
the LLM can generate a response (`03_API_and_Data_Contract.md` §2, Data Privacy and Safety
Architecture §8). Running text-mood inference on-device therefore does **not** prevent the
message from reaching the backend. It changes where a *derived score* is computed, not
whether the *source text* is transmitted.

Concluding "on-device is more private, as with FER" would be a reasoning error, and it is
recorded here so it is not made later. Privacy is scored **neutral** between A and B.

The genuine privacy consideration is a smaller one: under option B the message is sent to
the backend *twice* (once for mood, once for chat) unless the endpoints are combined. That
is a data-minimisation point (NFR-14), addressable by design in either option, and is not
by itself decisive.

### 3.2 The offline criterion is bounded

FR-21 requires graceful degradation and commits only to the offline functions **actually
supported**. Master Plan Phase 9 is explicit that the LLM response requires network unless
an offline model exists, and that the system must not claim to be fully offline.

So under option A, offline text-mood inference produces a mood state that **cannot be used
to generate a response** while offline. The offline advantage is real but narrow: it
benefits local history annotation and mood summaries, not conversation. Score it
accordingly rather than as a decisive win.

## 4. Pre-registered decision rule

Fixed **now**, before any measurement, so the decision cannot be fitted to whichever result
arrives.

### 4.1 Symbols to be set at Phase 4 entry

| Symbol | Meaning | Value | Set by |
|---|---|---|---|
| `S_ceiling` | Maximum acceptable on-device text-model footprint, alongside the FER model | **TBD** | Phase 4 entry, informed by Phase 3 FER model size and target-device memory |
| `Δ_sinhala` | Sinhala macro-F1 margin beyond which model quality overrides placement preference | **TBD** | Phase 4 entry |

Both must be recorded **before** candidate models are evaluated.

### 4.2 Decision sequence

```
1. Does any adequately-performing Sinhala candidate fit within S_ceiling?
       NO  → Option B (backend). Decision ends.
       YES → continue

2. Does the best backend-only candidate exceed the best on-device-feasible
   candidate's Sinhala macro-F1 by more than Δ_sinhala?
       YES → Option B (backend). Sinhala quality wins. Decision ends.
       NO  → continue

3. Score remaining criteria (§3) on measured evidence.
   Default to Option A (on-device) unless the measured evidence contradicts it.
```

**Pre-committed tie-break:** where Sinhala quality and placement preference conflict,
**Sinhala quality wins.** Sinhala is the project's identified weak point and the source of
its stated contribution; a placement preference is an engineering convenience.

## 5. Evidence required — produced at Phase 4, not now

| Evidence | Producer |
|---|---|
| Selected Sinhala model size on disk and peak memory in use | Phase 4 |
| On-device text inference latency on the named target device | Phase 4, per `PERFORMANCE_BENCHMARK_PLAN.md` |
| Backend round-trip latency under representative connectivity | Phase 4 |
| Quantized vs full macro-F1 delta, per language | Phase 4 |
| Combined on-device footprint with the Phase 3 FER model | Phase 3 + Phase 4 |
| Expo/React Native feasibility of a second inference runtime | Sprint 8 technology verification (Phase 5 gating subset) |

**No value above may be estimated.** If a measurement is unavailable at Phase 4 exit, the
decision is deferred again with a recorded reason — not guessed.

## 6. Constraints that hold under either option

- The evidence contract (Mood State Specification §A4) is identical in both options.
- `POST /api/v1/mood/text` remains the specified interface shape either way.
- No Phase 2 or Phase 3 artefact may assume a placement.
- `model_version` is reported in the result regardless of placement (NFR-11).
- Behavioural signals are not an input under either option.

## 7. Acceptance criteria for this memo

- [x] Options stated
- [x] Criteria fixed with reasoning
- [x] Privacy non-decisiveness recorded explicitly
- [x] Offline advantage bounded
- [x] Decision sequence pre-registered
- [x] Tie-break pre-committed
- [x] Evidence and producers named
- [x] Decision field marked `UNRESOLVED — resolve at Phase 4 exit`
- [ ] `S_ceiling` and `Δ_sinhala` set at Phase 4 entry
- [ ] Decision recorded at Phase 4 exit

## 8. Decision

> **UNRESOLVED — to be resolved at Phase 4 exit against §4.2.**
>
> When resolved, record the outcome here with the measured evidence, update
> `02_Module_and_Submodule_Specification.md` §1 (M4 "Runs" column), and update
> `PROJECT_STATUS.md`.

## References

- Module and Submodule Specification §5 (M4) — `docs/system/SYSTEM_DESIGN.md (Part 2)`
- API and Data Contract §2, §3 — `docs/system/SYSTEM_DESIGN.md (Part 3)`
- Mood State Specification §A4, §B3 — `docs/system/MOOD_STATE_SPEC.md`
- Technology and Model Selection §4 — `docs/system/SYSTEM_DESIGN.md (Part 5)`
- Detailed Build Master Plan, Phases 4 and 9 — `docs/project/`
