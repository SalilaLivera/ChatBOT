---
title: MaternaLink FER
emoji: 🙂
colorFrom: indigo
colorTo: pink
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: mit
---

# MaternaLink FER — 7-class calibrated facial expression recognition

Standalone inference service for the fine-tuned MobileNetV2 facial expression
recogniser built for **IT22638168 (MaternaLink)**.

> **This is not a diagnostic tool.** It estimates *facial expression* from a single
> image. It does not measure emotion, mood, wellbeing, or any mental-health state,
> and it must never be presented as a medical or psychological assessment.

---

## What it does

Takes one **cropped face image** and returns **seven calibrated probabilities**:

```
angry, disgust, fear, happy, neutral, sad, surprise
```

## What it does NOT do

| not done here | why | where it belongs |
|---|---|---|
| **face detection** | the caller supplies a crop | BlazeFace, upstream |
| **CALM / NEUTRAL / DISTRESSED mapping** | the 7→3 mapping is **undecided** (OD-4) | application layer, later |
| temporal smoothing across frames | `N_smooth` undecided | application layer |
| confidence gating | `τ_face_min` undecided | application layer |
| text-sentiment fusion | separate component | fusion layer |
| storing images or predictions | privacy: frames are never retained | — |

**The service outputs 7 FER classes. It does not output CALM / NEUTRAL /
DISTRESSED.** Anything that needs those must apply its own mapping downstream, and
that mapping has not yet been decided.

## Input contract

`POST /predict`, `multipart/form-data`, field name **`image`**.

- Formats: JPEG, PNG, BMP, WEBP
- Max size: 8 MB
- Minimum dimension: 16 px
- Expected content: **a cropped face region**, any size — the service resizes

## Output contract

```json
{
  "model_version": "fer-mobilenetv2-96-float32/1.0.0",
  "model_sha256": "47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c",
  "class_order": ["angry","disgust","fear","happy","neutral","sad","surprise"],
  "probabilities": {
    "angry": 0.0, "disgust": 0.0, "fear": 0.0, "happy": 0.0,
    "neutral": 0.0, "sad": 0.0, "surprise": 0.0
  },
  "predicted_class": "neutral",
  "confidence": 0.0,
  "calibrated": true,
  "label_space": "fer7"
}
```

*Probability values above are placeholders showing shape only.* `probabilities`
sums to 1.0. `predicted_class` is the argmax over `class_order`.

Other endpoints: `GET /health` (liveness + loaded artifact identity),
`GET /contract` (the full machine-readable contract).

## Preprocessing

Frozen, transcribed from `ml/fer/outputs/nb07_tensor_spec.json`:

1. decode as **single-channel grayscale**
2. resize to **48×48** bilinear → round → `uint8`
3. **replicate grayscale to 3 channels**
4. bilinear resize to **96×96**
5. `[0,255] → [-1,1]` (`mobilenet_v2.preprocess_input`, i.e. `x/127.5 - 1`)

Producing `float32`, shape `(1, 96, 96, 3)`.

**Step 2 is not redundant.** The model has only ever seen 48×48 FER-2013 images. A
live camera crop carries far more detail than anything in its training
distribution. Downsampling to 48×48 first deliberately discards that surplus so
live input matches training. Removing the step is a silent distribution shift.
See the docstring in `fer_service/preprocessing.py`.

## Calibration

Probabilities are **temperature-scaled**, fitted on validation in notebook 07:

| | before | after |
|---|---|---|
| Expected Calibration Error | 0.3010 | **0.0126** |
| temperature | — | **T = 5.727** |
| predictions changed | — | **0 / 3,589** |

Temperature is **baked into the exported graph**. The service does not apply it
again — doing so would double-scale the logits.

Because calibration is argmax-invariant, every accuracy figure below remains
exactly valid after calibration.

## Measured performance

| | |
|---|---|
| Test macro-F1 | **0.6036** |
| Test accuracy | **0.6289** |
| Test split | FER-2013 `PrivateTest`, 3,589 images, **touched exactly once** |
| Validation macro-F1 (this float32 artifact) | 0.6122 |
| Validation ECE | 0.0099 |
| Agreement with the validated Keras model | 99.5% |

Per-class F1 ranges from **0.844** (`happy`) down to **0.475** (`fear`).

## Limitations — read before using any output

1. **Demographic skew.** FER-2013 is predominantly Western/Caucasian. External
   validity for Sri Lankan users is **unvalidated**. This is the most serious
   limitation for MaternaLink's intended deployment.
2. **Negative expressions are poorly separated.** `angry`, `disgust`, `fear` and
   `sad` confuse heavily with each other (F1 ≈ 0.47–0.57). `happy` (0.84) and
   `surprise` (0.73) separate cleanly; the negative group does not.
3. **Low source resolution.** 48×48 grayscale. Fine facial detail is unavailable.
4. **Lighting sensitivity.** In the darkest decile of images, macro-F1 falls to
   0.457 against 0.644 in the brightest — minority classes degrade far more than
   accuracy alone suggests.
5. **Single-frame only.** No temporal context.
6. **Expression ≠ emotion.** A facial expression is not an internal emotional
   state, and this distinction must be preserved in any downstream use.

## Which variant is deployed, and why

`float32`. Hugging Face runs on **x86**, and on x86 notebook 07 measured float32 as
both the most accurate *and* the fastest variant (1.78 ms mean vs float16's 2.62 ms).
File size is irrelevant server-side.

**This is not the mobile variant decision.** On-device latency (P-02) has not been
measured — notebook 08 correctly recorded it as UNMEASURED. The mobile choice
remains open and is expected to differ.

## Obtaining the model

The `.tflite` file is **not in git** (`*.tflite` is gitignored project-wide). Place
it at `models/fer_mobilenetv2_96_float32.tflite`.

Its SHA-256 is pinned in `fer_service/contract.py` and **verified at load time** —
the service refuses to start on a mismatch rather than serve an unidentified model.

## Running locally

```bash
pip install -r requirements.txt
python app.py          # http://localhost:7860
```

```bash
curl -X POST http://localhost:7860/predict -F "image=@face.jpg"
```

## Verifying before deployment

```bash
python tools/verify_parity.py \
    --images-root ~/fer/data/raw \
    --manifest ../../ml/fer/outputs/splits_cleaned.csv \
    --reference ../../ml/fer/outputs/nb04_val_probabilities.csv \
    --limit 500
```

This service preprocesses with **Pillow**; the notebooks used **TensorFlow**. JPEG
decoding is equivalent by construction (notebook 07 pinned
`dct_method='INTEGER_ACCURATE'` precisely because it is bit-exact with Pillow), but
**bilinear resize equivalence is not guaranteed**. The script measures it rather
than assuming it, on VALIDATION only.

**Until this passes, preprocessing parity is unverified.**

## Privacy

Images are processed in memory and discarded. Nothing is written to disk, logged,
or retained. No training data, dataset images, or training-only metadata is exposed
through the API.

## Provenance

| | |
|---|---|
| architecture | MobileNetV2 (α=1.0, ImageNet init), fine-tuned |
| parameters | 2,266,951 |
| training data | FER-2013 de-duplicated train split (26,901 images) |
| fine-tuning run | `run_20260823_163030` |
| evaluation run | `run_20260828_052743` |
| conversion run | `run_20260828_142821` |

## Licence

MIT for the code. FER-2013 carries its own terms; **no dataset images are
distributed with this service.**
