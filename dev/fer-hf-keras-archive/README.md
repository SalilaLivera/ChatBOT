---
library_name: keras
tags:
  - archive
  - provenance
  - not-for-deployment
---

# MaternaLink FER — Keras Training Artifacts (Private Archive)

**These are TRAINING ARTIFACTS, not a deployable model.** They are archived here solely as
the durable off-machine copy of irreplaceable files. Do not load these for inference in any
application.

## What to use instead

The **deployed** artifacts are the `.tflite` files in the public A3 model repo:
<https://huggingface.co/mykkularathne/maternalink-fer-mobilenetv2>

Every deployed `.tflite` was converted from `fer_mobilenetv2_finetuned_96.keras`. Conversion
is one-way — a `.tflite` cannot be converted back to `.keras` — which is why the source Keras
files are preserved here.

## Files

| file | bytes | SHA-256 |
|---|---|---|
| `fer_mobilenetv2_finetuned_96.keras` | 24,464,001 | `226467016084be4df6f38fe8e756233062f7d7a5cdc567e39d2788b6a02cdc2f` |
| `fer_mobilenetv2_finetuned_96_calibrated.keras` | 24,466,049 | `f6182a630a0e93c375354cad08bbb2baf3eb903d1da3b1ff7ef581e4f0bd993a` |
| `fer_mobilenetv2_frozen_96.keras` | 9,730,709 | `8275774ff51eb230430a0c5d59bdd91b7c9b5307827e301dc928522283058513` |

- **`fer_mobilenetv2_finetuned_96.keras`** — the fine-tuned model. The single source from which
  every deployed `.tflite` artifact was converted.
- **`fer_mobilenetv2_frozen_96.keras`** — the frozen-backbone checkpoint from the earlier
  training stage.
- **`fer_mobilenetv2_finetuned_96_calibrated.keras`** — **DOES NOT RELOAD.** Per notebook 08
  section 6, the calibration wrapper was saved with an empty config, so Keras cannot
  reconstruct it on load. It is archived for provenance only and is **not a working model**.

## Regeneration

None of this can be regenerated. The FER test split has already been contacted its one
permitted time, so the model cannot be honestly retrained — there would be no clean held-out
set to report against. These files are irreplaceable.
