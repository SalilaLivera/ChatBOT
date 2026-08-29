---
tags:
  - private-archive
  - not-for-deployment
language:
  - si
---

# SinBERT-small 3-class mood — MaternaLink Experiment 02 (PRIVATE ARCHIVE)

**This is a private backup, not a published model.** It exists so that an
irreplaceable artifact is not held on a single laptop with no off-machine copy.
It is not a model release, and its metrics must not be read as a claim of fitness
for any use.

## What this is

- **SinBERT-small, 3-class sequence classification**: `CALM` / `NEUTRAL` /
  `DISTRESSED` (label order is load-bearing — index 0/1/2 of the probability
  vector, exactly as in `config.json` `id2label`).
- MaternaLink **Experiment 02** development checkpoint (development/validation
  only; not a validated final model).
- Base model: **`sinhala-nlp/sinhala-sentiment-analysis-sinbert-small`**,
  revision **`7059f20a28a2b1e2ff2f45b13d6956435cdacb6a`**, with a new
  `RobertaForSequenceClassification` head (3 outputs).
- Architecture `RobertaForSequenceClassification`; 6 layers, 6 heads, hidden 768,
  vocab 30000; `dtype` float32; `max_length` 512, truncation on; **no text
  normalisation of any kind** (Sinhala combining marks / ZWJ / ZWNJ make Unicode
  normalisation semantically significant).
- Prediction rule: softmax over logits, then argmax. No threshold tuning, no 7→3
  FER mapping, no fusion, no smoothing.

## SINHALA ONLY — and read the CALM point carefully

English input is **out of scope**, established by measurement. In the one-time
frozen-test run the model predicted **`CALM` for all 60 English records**
(macro-F1 **0.1667** — exactly chance for 3 classes).

On the **Sinhala-only** frozen slice, macro-F1 is **0.3876**, and within that
**`CALM` recall is 0.150 — the model's *worst* class**, not its best. An earlier
handover document stated this backwards. State it correctly: CALM is where this
checkpoint is weakest on held-out Sinhala data.

(The full 120-record frozen aggregate — 60 SI + 60 EN — is accuracy 0.375,
macro-F1 0.362. That number mixes the two languages and should not be quoted as a
Sinhala result.)

## The frozen test is spent — this cannot be regenerated

The MaternaLink sentiment held-out ("frozen") test set has been used its **one
permitted time**. A retrain would have no clean held-out set to report against, so
this checkpoint **cannot be honestly reproduced**. That is why it is archived
here.

## Certification

This exact checkpoint has been certified twice against Experiment 02's recorded
numbers:

- **B1 — inference parity** (`ml/sentiment/outputs/b1_parity/B1_PARITY_FINDINGS.md`):
  a standalone inference package reproduces the recorded validation probabilities
  to **max abs prob diff 4.47e-07** batch-of-1 (and 1.1e-16 at the reference's own
  batching), **argmax 76/76** on the 76 Dev-v2 validation records.
- **B2-A — service parity** (`ml/sentiment/outputs/b2_service/B2A_SERVICE_FINDINGS.md`):
  the HTTP service reproduces the package's outputs exactly.

## Files and hashes

| file | bytes | sha256 |
|---|---|---|
| `model.safetensors` | 266,241,260 | `624da0651206746aa211a9fe472280a488effb75f4ef230f933d565688a965b9` |
| `config.json` | 972 | `7d29f307876bf2db8d3a003ad2649de63d88c9cbe38e3ea1dbb4db303ade0f27` |
| `tokenizer.json` | 2,849,982 | `15611347ac83a7a4b1d19760a4312d37d362eded82183442c1edd3cb0be2250a` |
| `tokenizer_config.json` | 670 | `7e1ed88dd146118dbb96050c36b388e868d3ca9d0e22f58539ba3606bac29e28` |

The four files are a **set**. Weights without `tokenizer.json` are a dead artifact
— the vocabulary cannot be reconstructed and the checkpoint becomes unloadable.

## Not included, on purpose

No dataset text, no CSV, no notebook, no evaluation output. The Dev-v2 and
frozen-test corpora are pregnancy-domain personal-style content and are never
distributed.

## Load

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
tok = AutoTokenizer.from_pretrained("<local dir>", local_files_only=True)
model = AutoModelForSequenceClassification.from_pretrained("<local dir>", local_files_only=True)
```
