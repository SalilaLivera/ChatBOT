# ml/sentiment/ — Bilingual Text Mood Model

**Status:** Not started. Deferred to its designated phase (Build Plan, Phase 4).

This folder is scaffolded so the structure exists. **Do not begin model work here while
FER (Phase 2/3) is the active track.**

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
