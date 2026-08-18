# experiments/ — Consolidated Results and Reports

**Status:** Empty. No experiment has been run.

Deliberately lightweight. This is **not** an experiment-management system.

## Purpose

This folder answers cross-cutting research questions — the ones that involve **more than
one model**. Per-model results stay with their model in `ml/<track>/outputs/`.

| Question | Lives in |
|---|---|
| How did *this* FER training run perform? | `ml/fer/outputs/` |
| How did *this* text model run perform? | `ml/sentiment/outputs/` |
| **Does face + text beat face alone or text alone?** | **here** |
| Consolidated report for the dissertation | **here** |

That distinction is the reason this folder exists. The project's headline research
experiment is a comparison **across** models, and it has no home inside either model's
folder.

## Layout

| Folder | Contents |
|---|---|
| `results/` | Consolidated result files — comparison tables, aggregated metrics, ablation outputs |
| `reports/` | Written analysis: what the numbers mean, what they do not show, limitations |

Do not add nested folders per experiment. Notebooks already record their own run metadata.

## The main research experiment

From `docs/project/BUILD_PLAN.md` Phases 7 and 11:

```
Face only
Text only
Face + Text
```

Measured on accuracy, macro-F1, confusion matrix, and **agreement with participant
self-report**.

Questions it must answer:

1. Does fusion improve performance?
2. When does face help?
3. When does text help?
4. What happens when one modality is missing?
5. Does confidence-aware fusion improve reliability?

## Also consolidated here

| Experiment | Phase |
|---|---|
| Fusion weighting comparison — equal vs validation-derived vs confidence-aware | 7 |
| Adaptive vs non-adaptive chatbot — supportiveness, appropriateness, empathy, naturalness, satisfaction | 8 / 11 |
| Engineering benchmarks — latency, memory, model size, startup | 11 |
| Privacy verification results | 11 |
| Usability evaluation, Sinhala and English | 11 |

## Rules

1. **No invented numbers.** Every value traces to a run ID in `ml/*/outputs/`.
2. **Report the negative results.** If fusion does not beat the single modalities, that is
   a finding and it goes in the dissertation. Do not quietly drop it.
3. **Report macro-F1, not just accuracy** — both label spaces are imbalanced.
4. **Self-report is a validation reference, not clinical ground truth** (Build Plan Phase 11).
5. **No human participant data** before SLIIT IERC ethics approval.
6. Every consolidated result names the model versions and dataset versions it came from.

## What belongs here

Cross-model comparisons, ablation results, consolidated metric tables, written analysis,
dissertation-ready figures.

## What does NOT belong here

- Individual training-run logs → `ml/*/outputs/`
- Per-model plots → `ml/*/plots/`
- Trained models → `ml/*/models/`
- Specifications → `docs/`

## Current status

Nothing to report. No model has been trained, so no result exists.

## Continue reading

→ `../ml/README.md` — how runs are recorded
→ `../docs/project/BUILD_PLAN.md` Phases 7 and 11 — the full evaluation definition
→ `../docs/system/PERFORMANCE_BENCHMARK_PLAN.md` — the measurement protocol
