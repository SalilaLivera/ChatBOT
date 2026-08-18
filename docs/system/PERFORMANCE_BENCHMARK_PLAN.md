# IT22638168 — Performance Benchmark Plan

**Status:** Phase 1 design baseline — protocol frozen; **all values TBD by design**
**Date:** 2026-08-19
**Governs:** NFR-08 (Performance), NFR-09 (Android compatibility), NFR-12 (Reproducibility)

---

## 1. The problem this document solves

Two project statements appear to conflict:

| Source | Statement |
|---|---|
| Proposal §5.3 | "FER inference target: within 3 seconds… chatbot response target: within 5 seconds" |
| NFR-08 | "Exact targets will be set after device benchmarking rather than invented." |

**They do not actually conflict.** The apparent contradiction is a category error: the word
"target" is being used for two different things. This plan fixes the terminology.

## 2. Four distinct concepts — adopt this vocabulary project-wide

| # | Concept | Definition | Current state | Frozen when |
|---|---|---|---|---|
| 1 | **Proposal target** | A design aspiration stated in the submitted proposal. Not a requirement, not a measurement. | 3 s FER, 5 s chatbot response (Proposal §5.3) | Already stated; will not change |
| 2 | **Engineering requirement** | A budget the implementation is built to hit, set once the system's real cost profile is known. | **Not set** | Phase 3 (FER), Phase 6 (chatbot) |
| 3 | **Measured result** | A number produced by running this protocol. | **None exist** | Produced per phase |
| 4 | **Acceptance threshold** | The value a result must meet for the system to be judged acceptable. | **Not set** | Phase 11 |

Rules that follow:

- A proposal target is **never** reported as a measured result.
- A measured result is **never** invented, estimated, or extrapolated.
- If a measured result misses the proposal target, that is a **finding to report**, not a
  number to adjust. Master Plan §13's research principle applies: every AI decision must be
  measurable, explainable, reproducible and defensible.

**No performance target can be frozen during Phase 1, because no model exists to measure.**
What Phase 1 owns is the protocol and the device — this document.

## 3. Device policy

### 3.1 Primary measurement device

| Property | Value |
|---|---|
| Class | Physical mid-range Android device (NFR-09 "representative") |
| Model | **TBD — to be named before Phase 3 exit** |
| Android version | **TBD** |
| RAM / SoC | **TBD** |

A single named physical device is the **sole source** of all reported latency and memory
figures. Its exact model, Android version, RAM and SoC are recorded here once secured and
reported alongside every result (NFR-12).

### 3.2 Emulator policy

The Android emulator is used for **functional and CI checks only**.

> **Emulator timings are never reported as results.** Emulator performance reflects host
> hardware, not a user's phone, and reporting it as a device measurement would be a
> fabricated result.

Permitted emulator uses: does it run, does it not crash, does the flow complete, does the
UI render Sinhala correctly. Not permitted: any latency, memory, or startup figure.

### 3.3 Secondary devices

Optional. If additional physical devices are available, results are reported **per device**,
never averaged across devices.

## 4. Metrics

Each metric specifies its definition, instrumentation point, and producing phase.
**No metric carries a value in this document.**

### 4.1 On-device — mood sensing

| ID | Metric | Definition | Instrumentation point | Phase |
|---|---|---|---|---|
| P-01 | Face detection latency | Frame available → face located/cropped | Around the detection call | 3 |
| P-02 | FER inference latency | Preprocessed tensor in → class scores out | Around the TFLite invoke | 3 |
| P-03 | Preprocessing latency | Raw frame → normalized model input | Around preprocessing | 3 |
| P-04 | **End-to-end camera→mood latency** | Frame captured → face mood result available. **This is the metric comparable to the Proposal's 3 s target** (= P-01 + P-02 + P-03 + smoothing overhead) | Capture callback → mood result emitted | 3 |
| P-05 | Text inference latency (on-device) | Message in → text mood result out | Around the inference call | 4 |
| P-06 | Fusion latency | Both modality results in → fused state out | Around the fusion call | 7 |

P-05 feeds the text-model placement decision (`TEXT_MODEL_PLACEMENT_DECISION.md` §5).

### 4.2 Network and backend

| ID | Metric | Definition | Instrumentation point | Phase |
|---|---|---|---|---|
| P-07 | Backend round-trip | Request sent → response received, excluding LLM time | Client-side, with server-side LLM span subtracted | 6 |
| P-08 | LLM latency | Provider request → provider response | Server-side, around the provider call | 6 |
| P-09 | Backend processing overhead | Round-trip minus LLM time | Derived (P-07 − P-08) | 6 |
| P-10 | Text inference latency (backend) | Server-side text mood inference | Server-side | 4 |
| P-11 | **Total user-visible chatbot latency** | User presses send → response rendered. **This is the metric comparable to the Proposal's 5 s target** | Client-side, end to end | 6 |

### 4.3 Resource

| ID | Metric | Definition | Phase |
|---|---|---|---|
| P-12 | FER model size on disk | Exported TFLite file size | 3 |
| P-13 | Text model size on disk | If on-device | 4 |
| P-14 | Peak memory — mood sensing active | Peak app memory during camera-enabled chat | 3 / 5 |
| P-15 | Peak memory — text-only | Peak app memory in text-only mode | 5 |
| P-16 | Combined on-device model footprint | FER + text model, loaded | 4 |
| P-17 | App startup time | Launch → interactive home screen | 5 |

P-12, P-13 and P-16 feed both the placement decision and the Phase 3 TFLite conversion work.

### 4.4 Reliability

| ID | Metric | Definition | Phase |
|---|---|---|---|
| P-18 | Offline reliability | Supported offline functions succeed with network disabled | 9 |
| P-19 | Crash / error rate | Over a defined test session count | 11 |

## 5. Measurement protocol

Applies to every latency and memory metric.

1. **Warm-up.** Discard the first N runs (N recorded); first-run costs include model load
   and JIT and are reported separately where relevant, not blended into steady-state.
2. **Repetitions.** A recorded minimum number of runs per metric, fixed before measuring.
3. **Statistic.** Report **median and 95th percentile**, not mean alone. A mean hides the
   tail, and the tail is what a user experiences as "slow".
4. **Conditions recorded.** Device model, Android version, build type (debug/release),
   battery state, thermal state, and for network metrics the connectivity type.
5. **Release builds.** Performance figures come from release builds. Debug-build timings
   are not reported as results.
6. **Model version recorded.** Every result is tagged with the model/fusion version it was
   produced against (NFR-11, NFR-12).
7. **Raw data retained.** Per-run values retained, not only the summary, so results are
   reproducible and re-analysable (NFR-12).

### 5.1 What must not happen

- No value estimated, interpolated, or carried over from another device.
- No emulator timing reported as a device result.
- No debug-build timing reported as a release result.
- No mean-only reporting.
- No result reported without its model version and device.

## 6. Freeze schedule

| Item | Set at | Basis |
|---|---|---|
| Target device named | Before Phase 3 exit | Procurement |
| FER engineering requirement (P-04) | Phase 3 exit | First real measurements + Proposal target as reference |
| Text model size ceiling `S_ceiling` | Phase 4 entry | P-12 + device memory |
| Chatbot engineering requirement (P-11) | Phase 6 exit | P-07/P-08 measurements |
| Acceptance thresholds (all) | Phase 11 | Full-system measurements |

Where a measured result differs materially from the Proposal target, the dissertation
reports both and explains the difference. It does not silently restate the target.

## 7. Relationship to other documents

| Document | Relationship |
|---|---|
| NFR-08 | This plan is the mechanism by which NFR-08 is discharged |
| NFR-09 | §3 names the representative device |
| NFR-12 | §5 defines what is recorded for reproducibility |
| Text Model Placement Decision Memo | Consumes P-05, P-07, P-10, P-13, P-16 |
| Local Storage Decision Memo | Spike check 3 uses this plan's protocol |
| Master Plan Phase 11 "Engineering evaluation" | This plan is the protocol for that phase |

## 8. Acceptance criteria

- [ ] Four-concept terminology (§2) adopted in NFR-08
- [ ] Every metric has a definition, instrumentation point, and producing phase
- [ ] Measurement protocol specified (warm-up, repetitions, statistic, conditions)
- [ ] Device policy stated; emulator exclusion explicit
- [ ] Physical target device named — **open**
- [ ] Zero invented or estimated values present in this document
- [ ] Freeze schedule agreed

## 9. Open items

| Item | Status | Owner |
|---|---|---|
| Physical target device model, Android version, RAM/SoC | **TBD** | Before Phase 3 exit |
| Warm-up count and repetition count per metric | **TBD** | Phase 3 entry |
| Realistic history volume for storage-related timing | **TBD** | Storage spike |
| All measured values | **None exist** | Phases 3–11 |

## References

- Functional and Non-Functional Requirements, NFR-08/09/12 — `docs/project/REQUIREMENTS.md`
- Detailed Build Master Plan, Phases 3, 6, 11 — `docs/project/`
- Text Model Placement Decision Memo — `docs/decisions/`
- Proposal §5.3 — `docs/project/IT22638168_Proposal_FINAL.docx`
