# ml/sentiment/ — Bilingual Text Mood Model

**Status:** Existing SinBERT baseline organized; no new experiment performed. Candidate comparison, domain adaptation, and final model selection remain future work in Phase 4.

The permanent candidate registry is [MODEL_BENCHMARK_CANDIDATES.md](C:\Users\Yasindu\Desktop\Chat_Research\chat\MODEL_BENCHMARK_CANDIDATES.md). The current source evidence identifies seven candidates, including the existing baseline; five requested registry slots remain explicitly unresolved until authoritative model identities are supplied.

The folder contains the migrated historical baseline evidence and the future working structure. **Do not tune or select a final model from the frozen test set.**

The Dev-v2 construction is documented in [`docs/DEV_V2_CONSTRUCTION_REPORT.md`](docs/DEV_V2_CONSTRUCTION_REPORT.md). The Experiment 02 design is documented in [`docs/EXPERIMENT_02_PLAN.md`](docs/EXPERIMENT_02_PLAN.md). Dev-v2 is validated, but Experiment 02 is **not ready to run** until the documented imbalance/readiness gate is accepted and explicit training authorization is given.

Experiment 02 was completed once under the authorized plan. Findings are recorded in `outputs/development_v2/experiment_02/EXPERIMENT_02_FINDINGS.md`; this remains development/demo evidence only.

## Current baseline

The starting model is `sinhala-nlp/sinhala-sentiment-analysis-sinbert-small` at revision `7059f20a28a2b1e2ff2f45b13d6956435cdacb6a`. It is a three-class sentiment model, not an application mood classifier:

```text
LABEL_0 = NEUTRAL
LABEL_1 = POSITIVE
LABEL_2 = NEGATIVE
```

MaternaLink's application states are `CALM`, `NEUTRAL`, `DISTRESSED`, and `UNKNOWN`. Sentiment labels must not be renamed into those states. The historical evaluation used `POSITIVE → CALM`, `NEUTRAL → NEUTRAL`, `NEGATIVE → DISTRESSED` only as a diagnostic proxy.

The actual frozen-set result was accuracy `0.3333`, macro-F1 `0.2945`, Sinhala macro-F1 `0.3000`, English macro-F1 `0.1667`, DISTRESSED recall `0.075`, mean latency `25.07 ms`, and 40 safety-relevant errors. These results do not justify treating SinBERT-small as the final mood model.

Alternative models in the registry are future candidates. No alternative candidate has been evaluated on the MaternaLink pregnancy-domain dataset unless a future evidence record says so. Published model-card and paper metrics are not MaternaLink metrics.

## Data and evidence

- Frozen test set: `data\processed\PREGNANCY_FROZEN_TEST_SET.csv` — 120 records, 20 per mood for each language. **FROZEN — DO NOT TOUCH.**
- Human ground truth: `data\processed\PREGNANCY_ANNOTATION_GROUND_TRUTH.csv` — human labels define ground truth.
- Baseline outputs: `outputs\baseline\`.
- Historical evaluation script: `scripts\evaluate_sinbert_historical.py`.
- Repository-adapted, configurable copy: `scripts\evaluate_sinbert.py` (not run during migration).
- Environment record: `ENVIRONMENT.md`.

Never tune, select thresholds, select models, select mappings, or repeatedly evaluate for optimization on the frozen test. Future decisions require separate development evidence.

The final selected model will receive one final frozen-test evaluation, unchanged and without tuning on that test set. No candidate notebooks have been created yet.

## Reproduction

See `ENVIRONMENT.md` and `scripts\evaluate_sinbert_historical.py`. The verified model is expected in the pinned local Hugging Face cache; model weights are not stored in Git. The repository-adapted script uses environment variables for dataset, model, and output paths, but was deliberately not executed during this migration.

## Purpose

Produce the second mood signal: a mood estimate with confidence from a Sinhala or English
message, independent of the facial signal.

```
Message
   ↓
language detection
   ↓
text preprocessing
   ↓
language-specific model
   ↓
mood + confidence + language
```

## Folder layout

| Folder | Contents |
|---|---|
| `notebooks/` | Numbered notebooks, same convention as `../fer/` |
| `data/raw/` | Source sentiment corpora, as obtained |
| `data/processed/` | Preprocessed and annotated splits |
| `plots/` | Confusion matrices, per-language comparisons |
| `models/` | Fine-tuned checkpoints |
| `outputs/` | Per-run metadata JSON and metrics |

## Deliberately NOT decided

Nothing below may be locked in early. Each is evidence-driven.

| Item | Decided at | Reference |
|---|---|---|
| Exact English model | Phase 4 | `docs/system/SYSTEM_DESIGN.md` Part 5 §4 |
| Exact Sinhala model | Phase 4 | Part 5 §4 |
| **Deployment location** — on-device vs backend | Phase 4 exit | `docs/decisions/TEXT_MODEL_PLACEMENT_DECISION.md` |
| Text label space → 3-state mapping | Phase 2/4 | `docs/system/MOOD_STATE_SPEC.md` §B3 |
| `τ_text_min` confidence threshold | Phase 4 exit | `MOOD_STATE_SPEC.md` §B1 |
| Fusion weights `W_face`, `W_text` | Phase 7 | `MOOD_STATE_SPEC.md` §B1 |
| LLM provider | Phase 6 | `SYSTEM_DESIGN.md` Part 3 §13 |

DistilBERT is named in the proposal as a **starting point for English**, not a decision.
The technology freeze rule (`SYSTEM_DESIGN.md` Part 5 §11) forbids freezing a model merely
because it is named in the proposal.

## Two problems to understand before starting

### 1. Polarity is not the same axis as mood

Available Sinhala and English sentiment resources are mostly **polarity** scales
(positive / negative / neutral). The application needs **affective-support** states
(`calm` / `neutral` / `distressed`). These are different axes — negative sentiment is not
equivalent to distress, and a positively-worded message can accompany distress.

So the mapping is **not a relabelling**. It requires a pregnancy-domain annotation guide,
a bilingual validation set annotated against the *application* states, and reported
inter-annotator agreement. See `MOOD_STATE_SPEC.md` §B3.

### 2. Sinhala does not inherit English performance

Sinhala is low-resource but advancing. Sinhala-specific encoder models exist and outperform
multilingual baselines on Sinhala benchmarks [S2]. **English performance does not transfer.**
Sinhala must be evaluated separately, with its own metrics reported separately — this is a
project baseline decision, not an optional nicety.

Published Sinhala benchmark figures are news-comment benchmarks, not pregnancy conversation.
They guide model selection; they are **not** expected project performance.

## Rules

- Report English and Sinhala metrics **separately**. Never average them into one number.
- Handle and document: Unicode normalization, mixed Sinhala/English, transliterated Sinhala,
  emoji, repeated characters.
- Every run writes metadata JSON to `outputs/` (see `../README.md`).
- No behavioural signals as model inputs.

## Continue reading

→ `../README.md` — ML conventions
→ `../../docs/system/MOOD_STATE_SPEC.md` §B3 — the text label-mapping problem
→ `../../docs/decisions/TEXT_MODEL_PLACEMENT_DECISION.md` — the placement decision procedure
→ `../../docs/project/BUILD_PLAN.md` Phase 4
