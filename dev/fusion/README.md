# `dev/fusion/` — Mood Fusion Layer (B4)

A **library**, not a service. No HTTP, no FastAPI. Implements
`docs/system/MOOD_STATE_SPEC.md` Part A (§A4–A7, frozen at Gate 1A) and nothing
else. Plan: `docs/plan/FUSION_B4_PLAN.md`.

> The fusion parameters this layer needs are **PLACEHOLDERS FOR TESTING**, not
> measured values. `W_face`, `W_text` and all thresholds remain
> **[FUTURE-EXPERIMENTAL]** pending the Phase 7 experiment.

## What it does

```python
from fusion import FusionParameters, fuse

params = FusionParameters.require(          # no defaults — omitting any symbol raises
    W_face=..., W_text=..., tau_face_min=..., tau_text_min=...,
    tau_fusion_min=..., tau_distress=...,
    provenance="PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE",
)
result = fuse(face_evidence, text_evidence, params)   # each may be None (A6)
result.to_contract()   # {state, confidence, modalities_used, fusion_version}
```

- **§A7** late fusion `Fused(c) = W_face·Face(c) + W_text·Text(c)` when both modalities are usable.
- **§A6** single usable modality → its scores pass through **unchanged** (weights do not apply).
- **§A5** `unknown` iff **no** modality is usable (or fused confidence `< tau_fusion_min`).
- **English hazard (B2-A §4):** text evidence whose `language` is not Sinhala is **not usable**,
  regardless of confidence. Missing `language` → `ContractViolationError`, never defaulted.

## What it cannot do

- **Not validated.** No dataset joins a face and a Sinhala message from the same person at the
  same moment with a ground-truth mood label. No accuracy / macro-F1 / confusion matrix for
  fusion exists or is produced.
- **Cannot produce the parameters.** They are a Phase 7 deliverable; `tau_distress` needs a user
  study. The layer refuses to construct without them.

## Files

| file | contents |
|---|---|
| `fusion/contract.py` | states, fixed order `calm, neutral, distressed`; `unknown` as a fusion determination only; A4 evidence validation; A7 output shape; `fusion_version = "fusion-v1"` |
| `fusion/parameters.py` | `FusionParameters` — no defaults, mandatory `provenance`, validates `W_face+W_text==1` and every `tau ∈ [0,1]` |
| `fusion/fusion.py` | the A7 rule, the A5 `unknown` conditions, the A6 table |
| `fusion/errors.py` | typed errors mirroring the FER / sentiment services |
| `tests/b4_checks.py` | F1–F13, each asserting a named spec clause |
| `tests/test_b4_contract.py` | pytest wrapper |
| `tools/run_b4_contract.py` | runs F1–F13, emits artifacts to `ml/fusion/outputs/b4_contract/` |

## Run

```
python -m pytest dev/fusion/tests/test_b4_contract.py -v
python dev/fusion/tools/run_b4_contract.py      # needs matplotlib for the PNG
```
