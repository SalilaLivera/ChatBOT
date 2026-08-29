---
license: mit
library_name: tf-lite
pipeline_tag: image-classification
tags:
  - facial-expression-recognition
  - fer2013
  - mobilenetv2
  - tflite
  - on-device
  - calibrated
datasets:
  - fer2013
language:
  - en
metrics:
  - f1
  - accuracy
model-index:
  - name: maternalink-fer-mobilenetv2
    results:
      - task:
          type: image-classification
          name: Facial Expression Recognition
        dataset:
          type: fer2013
          name: FER-2013 (PrivateTest split)
        metrics:
          - type: f1
            name: Macro-F1
            value: 0.6036
          - type: accuracy
            name: Accuracy
            value: 0.6289
---

# MaternaLink FER — MobileNetV2, 7-class calibrated

Facial **expression** recognition for the MaternaLink pregnancy-support research project
(IT22638168). Fine-tuned MobileNetV2, exported to TensorFlow Lite, with **temperature-scaled
(calibrated) probabilities**.

> ## ⚠️ This is not a diagnostic tool
>
> It estimates **facial expression** from a single image. It does **not** measure emotion,
> mood, wellbeing, or any mental-health state, and it must never be presented as a medical,
> clinical, or psychological assessment.
>
> Accuracy is **62.9%**. Roughly **one prediction in three is wrong.**

---

## What it outputs

Seven calibrated probabilities, summing to 1.0, in this exact order:

```
0 angry   1 disgust   2 fear   3 happy   4 neutral   5 sad   6 surprise
```

## What it does NOT do

| not included | why | belongs |
|---|---|---|
| **face detection** | expects a pre-cropped face | MediaPipe BlazeFace, upstream |
| **CALM / NEUTRAL / DISTRESSED output** | the 7→3 mapping is an **undecided** application-level decision | downstream, later |
| temporal smoothing | undecided | application layer |
| confidence gating | undecided | application layer |

**This model outputs 7 FER classes. It does not output CALM / NEUTRAL / DISTRESSED.**

**It does not detect faces.** Given a full uncropped frame it returns seven plausible-looking
probabilities that are meaningless, and **nothing in the output signals this**. Cropping
correctly is entirely the caller's responsibility.

---

## Files

| file | size | SHA-256 | use |
|---|---|---|---|
| `fer_mobilenetv2_96_float32.tflite` | 8,956,864 B | `47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c` | **server / x86 — recommended** |
| `fer_mobilenetv2_96_float16.tflite` | 4,578,244 B | `a83946afed5043953d03a00eb239c8cc3584fe9f28eed74ba7ac9456a79ca78d` | mobile candidate |
| `fer_mobilenetv2_96_dynint8.tflite` | 2,572,184 B | `3fbe843e46a59f879300715207a73fb912a1fb6ffe98984dc4c5ca55e2f4f2ec` | mobile candidate |
| `nb07_tensor_spec.json` | — | — | machine-readable tensor contract |

**A full-integer int8 variant exists and is deliberately NOT published** — it lost 0.1188
macro-F1 (18× the project's measured noise floor), its calibration collapsed (ECE 0.1443),
and it was *larger* than `dynint8`. It is strictly dominated and must not be used.

### Which variant

**`float32` for server-side inference.** On x86 it was measured as both the most accurate
*and* the fastest (1.78 ms vs float16's 2.62 ms mean); x86 has no native fp16 compute, so
float16 is dequantized at runtime. File size is irrelevant on a server.

**The mobile variant is undecided.** float16 is provisional but assumes ARM hardware fp16,
which has **not been measured** — no on-device benchmark has been run. Do not treat the
x86 latency figures as predictive for ARM.

| variant | val macro-F1 | ECE | agreement with the validated model |
|---|---|---|---|
| float32 | 0.6122 | 0.0099 | **99.5%** |
| float16 | 0.6090 | 0.0135 | 99.0% |
| dynint8 | 0.6071 | 0.0103 | **91.5%** — ~1 prediction in 12 differs |

All three are within the project's measured noise floor (0.0065 macro-F1) on aggregate
accuracy. `dynint8`'s **per-frame** disagreement is much larger than its aggregate metrics
suggest — a distinction aggregate numbers alone would have hidden.

---

## Tensor contract

| | |
|---|---|
| input | `float32`, shape `(1, 96, 96, 3)`, values in `[-1, 1]` |
| output | `float32`, shape `(1, 7)`, calibrated softmax |

### Preprocessing — exact, and not negotiable

```
1. decode as single-channel grayscale
2. resize to 48×48   (bilinear → round → uint8)
3. replicate grayscale to 3 channels
4. resize to 96×96   (bilinear, IN FLOAT32)
5. scale [0,255] → [-1,1]   (x / 127.5 - 1.0)
```

**Step 2 is not redundant.** The model was trained only on FER-2013, whose images *are*
48×48. A live camera crop carries far more detail than anything in its training
distribution; downsampling to 48×48 first discards that surplus so live input matches
training. Removing this step is a silent distribution shift.

**Step 4 must be done in float32.** Resizing as `uint8` rounds every interpolated pixel to
an integer grey level, which diverges from the reference by up to 1.0 grey level. That
sounds negligible — it is not. Because the model is calibrated (see below), a 0.4%-of-range
input difference produced a 0.135 probability difference and flipped **2.1% of predictions**
in testing. With float32 resizing the divergence is exactly zero.

---

## Calibration

Probabilities are **temperature-scaled**, fitted on validation and **baked into the exported
graph**. Do not apply temperature again.

| | before | after |
|---|---|---|
| Expected Calibration Error | 0.3010 | **0.0126** |
| temperature | — | **T = 5.727** |
| predictions changed | — | **0 / 3,589** |

Calibration is argmax-invariant, so every accuracy figure below remains exactly valid.

Before calibration the model claimed 99% confidence while being right 70% of the time. The
`confidence` output is now a usable probability — **but it is a model-certainty estimate, not
a measure of emotional intensity.**

**Side effect worth knowing:** calibration flattens the distribution, which makes the model
*more* sensitive to small input perturbations. Preprocessing must be exact.

---

## Performance

| | |
|---|---|
| **Test macro-F1** | **0.6036** |
| **Test accuracy** | **0.6289** |
| test split | FER-2013 `PrivateTest`, 3,589 images, **touched exactly once** |
| generalisation gap | **−0.0085** macro-F1 |

Per-class F1:

| class | F1 | | class | F1 |
|---|---|---|---|---|
| happy | **0.844** | | angry | 0.523 |
| surprise | 0.733 | | sad | 0.484 |
| neutral | 0.599 | | **fear** | **0.475** |
| disgust | 0.568 | | | |

Training used a de-duplicated, leakage-free FER-2013 train split (26,901 images). The test
split was contacted once, with no tuning afterwards. The near-zero generalisation gap
indicates the validation-driven selection protocol did not overfit.

For context, ~65% is the commonly cited human benchmark on FER-2013 and ~73% the published
state of the art.

---

## Verification

The exported artifact was verified against the pipeline that produced the published metrics:

- **Preprocessing parity** — the reference implementation reproduces the training-time
  TensorFlow pipeline **bit-identically**: max tensor difference **exactly 0.0** across
  99,228,672 elements over all 3,589 validation images, argmax agreement **1.0000**.
- **Service parity** — an HTTP inference wrapper was verified to preserve those numbers
  (max deviation 4.99e-7, entirely attributable to 6-decimal response rounding; argmax
  100/100).
- **Runtime equivalence** — `ai-edge-litert` vs `tf.lite`: max probability difference
  2.98e-8 (float32 epsilon), argmax 60/60.

---

## Limitations — read before using any output

1. **Demographic skew.** FER-2013 is predominantly Western/Caucasian. MaternaLink targets
   Sri Lankan users, and **external validity for that population is unvalidated.** This is
   the most serious limitation of this model.
2. **Negative expressions are poorly separated.** `angry`, `disgust`, `fear` and `sad`
   confuse heavily with one another (F1 ≈ 0.47–0.57). `happy` (0.84) and `surprise` (0.73)
   separate cleanly; **the negative group is not individually trustworthy.** Do not build
   logic that distinguishes between them.
3. **Low source resolution.** 48×48 grayscale. Fine facial detail is unavailable to the
   model.
4. **Lighting sensitivity.** In the darkest decile of images macro-F1 falls to 0.457 against
   0.644 in the brightest — minority classes degrade far more than accuracy alone suggests.
5. **Single-frame only.** No temporal context.
6. **Expression ≠ emotion.** A person may display an expression that does not reflect their
   internal state. The model observes appearance only.
7. **Label noise.** FER-2013 contains conflicting labels, imposing an accuracy ceiling
   independent of model quality.

### Explainability

Grad-CAM analysis found the model attends to central face regions, never to image corners,
backgrounds or watermarks, and that attention is **unchanged on errors** — failures are
genuine expression-discrimination failures, not attention failures. It does not use
per-class brightness as a shortcut. Feature-map resolution is 3×3, so only centre-vs-edge
and upper-vs-lower conclusions are supportable.

### Intended and out-of-scope use

**Intended:** research; a single auxiliary evidence channel in a multi-signal system, behind
appropriate safeguards.

**Out of scope:** any clinical, diagnostic, screening, hiring, surveillance, or
security-adjacent use; any autonomous decision affecting a person; any use where a raw class
label is shown to a user as a statement about their emotional state.

---

## Usage

```python
import numpy as np
from PIL import Image
from ai_edge_litert.interpreter import Interpreter   # or tflite_runtime / tf.lite

CLASSES = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]

def preprocess(img):                       # img: a PIL image of a CROPPED FACE
    gray   = img.convert("L")
    arr48  = np.asarray(gray.resize((48, 48), Image.BILINEAR), dtype=np.uint8)
    f      = Image.fromarray(arr48.astype(np.float32), mode="F")     # float32 — required
    a96    = np.asarray(f.resize((96, 96), Image.BILINEAR), dtype=np.float32)
    x      = np.stack([a96, a96, a96], axis=-1) / 127.5 - 1.0
    return np.expand_dims(x, 0).astype(np.float32)

itp = Interpreter(model_path="fer_mobilenetv2_96_float32.tflite")
itp.allocate_tensors()
inp, out = itp.get_input_details()[0], itp.get_output_details()[0]

itp.set_tensor(inp["index"], preprocess(Image.open("face_crop.jpg")))
itp.invoke()
probs = itp.get_tensor(out["index"])[0]

print(dict(zip(CLASSES, probs.round(4))), "->", CLASSES[int(np.argmax(probs))])
```

---

## Provenance

| | |
|---|---|
| architecture | MobileNetV2 (α=1.0, ImageNet init), fine-tuned |
| parameters | 2,266,951 (1,848,583 trainable) |
| input resolution | 96×96 (from 48×48 source) |
| training data | FER-2013, de-duplicated train split, 26,901 images |
| export | TensorFlow 2.21.0 / Keras 3.15.1 |

No dataset images are distributed with this model.

## Licence

**MIT** for the exported model artifacts and code. **FER-2013 carries its own terms**; users
are responsible for compliance with the dataset licence for any training or redistribution
of derived data.

## Citation

Undergraduate research project IT22638168 (MaternaLink), 2026. Facial expression recognition
as one evidence channel in a bilingual pregnancy-support conversational system.
