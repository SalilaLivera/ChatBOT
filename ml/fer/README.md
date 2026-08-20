# ml/fer/ — Facial Emotion Recognition

**Status:** Phase 2 — dataset preparation starting. Nothing trained yet.

## Training pipeline

```
FER-2013
   ↓
dataset inspection
   ↓
preprocessing
   ↓
augmentation
   ↓
MobileNetV2 transfer learning   (frozen backbone)
   ↓
fine-tuning                     (unfrozen top blocks)
   ↓
evaluation
   ↓
error analysis / Grad-CAM
   ↓
TFLite conversion
   ↓
mobile benchmark
```

**There is no separate baseline CNN.** MobileNetV2 transfer learning *is* the baseline.
Do not add one without a formal technical reason recorded in `docs/decisions/`.

## Mobile inference path

```
Camera
   ↓
MediaPipe BlazeFace       ← face detection
   ↓
face crop
   ↓
MobileNetV2 (TFLite)      ← on-device
   ↓
7 FER emotions
   ↓
mapped to application mood state
```

The model classifies FER-2013's **7 emotions**. The mapping from those 7 to the 3
application mood states (`calm` / `neutral` / `distressed`) is a **separate, not-yet-made
decision** — see the open items below.

Do not change this architecture without a recorded technical reason.

## Notebooks — run in order

| # | Notebook | Purpose |
|---|---|---|
| 01 | `01_dataset_exploration.ipynb` | Load FER-2013, class distribution, corrupt/duplicate samples, image quality |
| 02 | `02_data_preparation.ipynb` | Preprocessing, augmentation, leakage-free train/val/test splits |
| 03 | `03_mobilenetv2_transfer_learning.ipynb` | Frozen-backbone transfer learning |
| 04 | `04_mobilenetv2_fine_tuning.ipynb` | Unfreeze top blocks, fine-tune |
| 05 | `05_model_evaluation.ipynb` | Accuracy, macro-F1, per-class precision/recall, confusion matrix |
| 06 | `06_error_analysis_gradcam.ipynb` | Failure modes, Grad-CAM, pose/lighting effects |
| 07 | `07_tflite_conversion.ipynb` | TFLite export, quantization, accuracy delta vs float model |
| 08 | `08_mobile_benchmark.ipynb` | On-device latency, model size, memory |

Add further notebooks freely with the next number. **Do not create a folder per experiment.**

## Folders

| Folder | Contents |
|---|---|
| `data/raw/` | FER-2013 as downloaded. Never edit. |
| `data/processed/` | Generated splits and preprocessed arrays. Reproducible from `02`. |
| `plots/` | Confusion matrices, training curves, Grad-CAM figures |
| `models/` | Checkpoints, saved models, exported `.tflite` |
| `outputs/` | Per-run metadata JSON and metrics |

## Open decisions — do NOT resolve by assumption

| Item | Where the procedure is defined | Decided at |
|---|---|---|
| **FER 7-class → 3-state mood mapping** | `docs/system/MOOD_STATE_SPEC.md` §B2 — use the AffectNet valence/arousal procedure | Phase 2 exit |
| `τ_face_min` — minimum usable FER confidence | `MOOD_STATE_SPEC.md` §B1 | Phase 3 exit |
| `N_smooth` — temporal smoothing window | `MOOD_STATE_SPEC.md` §B1 | Phase 3 exit |
| TFLite tensor spec, input dims, normalization | Phase 3 exit deliverable | Phase 3 exit |

### The mapping problem, briefly

FER-2013 gives 7 categorical classes: `angry`, `disgust`, `fear`, `happy`, `sad`,
`surprise`, `neutral`. The application needs 3 states. `happy`→`calm` and `sad`→`distressed`
are intuitive; **`surprise` and `disgust` are not**, and guessing them is not defensible.

The approved method is to locate each class in AffectNet's valence/arousal space, define the
three states as regions there, then transfer to FER-2013 by class name. The stated
limitation — FER-2013 has no valence/arousal annotations, so that transfer is categorical
rather than measured — must be reported, not hidden.

### Registered checkpoint

**Are `calm` and `neutral` actually separable by FER?** Check the confusion matrix in
notebook `05`. If they are not, the correct response is to revise the mood specification to
two substantive states plus `unknown` via a decision memo — not to force a three-way split.
This is an acceptable outcome and is cheaper to find now than in Phase 7.

## Rules

- Read `docs/system/MOOD_STATE_SPEC.md` before notebook `02` — the label mapping determines
  the model head.
- Every training run writes its metadata JSON to `outputs/` (see `../README.md`).
- Report macro-F1 alongside accuracy. FER-2013 is class-imbalanced; accuracy alone misleads.
- Evaluate pose and lighting effects — the literature identifies these as the main
  real-world deployment risks ([F5], [F6]).
- The test set is touched once, at the end.
- No raw facial images committed or published in identifiable form.

## Current status

Nothing has been trained. FER-2013 research use is verified.

Notebook `01` (dataset exploration) is **written and verified against the local copy of the
dataset**. FER-2013 has been relocated into `data/raw/` and its integrity confirmed — see
*Verified dataset facts* below. The canonical FER-2013 split protocol is **confirmed viable**.

Notebook `02` (data preparation) is **written and run**. The duplicate leakage found in `01`
is resolved: de-duplication is applied to TRAIN only, so the leakage is eliminated while
`PublicTest`/`PrivateTest` stay comparable to published FER-2013 benchmarks. MediaPipe
BlazeFace was measured across the full dataset and **validated as the deployment detector but
rejected as a data-cleaning filter** — see *Notebook 02* below.

**Open for Phase 3:** de-duplication made the class imbalance worse (16.55:1 -> 20.01:1) and
`disgust` now has 351 training images. Do not resample before that decision is recorded.

## Verified dataset facts

All figures below were **measured**, not assumed. Source: `ml/fer/data/raw/`, verified
independently by the ML supervisor after relocation.

**Totals** — 35,887 files, 56,510,189 bytes, 100% `.jpg`. Zero corrupt, zero unreadable,
zero zero-byte files.

**Images** — every one of the 35,887 images is exactly 48x48, PIL mode `L`
(8-bit single-channel grayscale). No exceptions, no mixed resolutions.

**Split integrity — CONFIRMED.** The original FER-2013 split is intact and partitions cleanly
by filename prefix, with zero cross-contamination:

| directory | `Training_` | `PublicTest_` | `PrivateTest_` | other |
|---|---|---|---|---|
| `train/` | 28,709 | 0 | 0 | 0 |
| `test/` | 0 | 3,589 | 3,589 | 0 |

Adopted protocol: `train/` = TRAIN (28,709) · `PublicTest_` = VALIDATION (3,589) ·
`PrivateTest_` = FINAL TEST (3,589, touched once).

**Class distribution**

| class | train | train % | val (Public) | test (Private) |
|---|---|---|---|---|
| angry | 3,995 | 13.92 | 467 | 491 |
| disgust | 436 | 1.52 | 56 | 55 |
| fear | 4,097 | 14.27 | 496 | 528 |
| happy | 7,215 | 25.13 | 895 | 879 |
| neutral | 4,965 | 17.29 | 607 | 626 |
| sad | 4,830 | 16.82 | 653 | 594 |
| surprise | 3,171 | 11.05 | 415 | 416 |
| **total** | **28,709** | 100 | **3,589** | **3,589** |

Imbalance (max:min, happy:disgust) — train **16.55:1**, test **15.98:1**. Class proportions
are consistent across the three groups, so the split is not distributionally skewed.

**Pixel intensity** (0-255) — overall mean 129.38, std 65.08, median 134, full 0-255 range.
Per-split means agree to within 0.5 (train 129.47 / val 128.98 / test 129.08). Per-class
means span 121.04 (sad) to 146.27 (surprise).

**Duplicate and leakage audit** — measured three ways over all 35,887 images:

| method | dup groups | affected files | cross-group (leakage) |
|---|---|---|---|
| MD5 (exact bytes) | 1,516 | 3,369 | **557 groups / 1,323 files** |
| dHash (exact match) | 1,581 | 3,556 | 588 groups / 1,422 files |
| dHash Hamming <= 3 | 2,051 | 5,100 | 807 groups / 2,311 files |

MD5 leakage breakdown: train<->val 270 · train<->test 278 · val<->test 43. Of the 557
exact-byte cross-group groups, **26 carry conflicting class labels** — byte-identical images
filed under different emotions. Unique MD5 count is 34,034, i.e. 1,853 of 35,887 files
(5.2%) are exact-byte redundant.

**Quality anomalies** — 12 fully-black images, 14 near-constant (std < 5), 67
brightness outliers (|z| >= 3); 68 distinct images flagged overall. Visual inspection also
found stock-photo watermarks and at least one non-face raster artifact.

## Notebook 02 — cleaning policy and detector validation

Measured on the local isolated conda env (`maternalink-fer`, Python 3.10.20, mediapipe 1.0.1,
opencv 5.0.0). Run `run_20260820_102420`.

**Reproducibility gate: PASSED.** All eight of notebook 01's headline figures reproduced
exactly in a *different* environment with different library versions (Python 3.10 vs 3.12,
mediapipe 1.0.1 vs 0.10.32, opencv 5.0 vs 4.10). Three environments now agree on the dataset
census, the duplicate counts and the leakage counts.

**BlazeFace — validated as the deployment detector, rejected as a data filter.**

Detection rate over all 35,887 images: **99.94%** (35,867 detected), uniform across classes
(99.82%–100%) and across train/val/test. Winning config: short-range model, no upscale.
Full pass: 85 s on CPU.

This *validates the deployment path* — FER-2013's 48x48 crops are compatible with what
MediaPipe BlazeFace produces at inference time, so the training distribution matches the
serving distribution.

It is **not** usable for cleaning, and the measurement is what established that:

| evidence | result |
|---|---|
| images it removed from train | 17 of 28,709 |
| known-junk images it detected as faces | 50 of 68 |
| mean confidence, cross-split duplicates | 0.724 — indistinguishable from normal (0.720) |
| mean confidence, known junk | 0.480 vs 0.720 normal — overlapping |
| confidence threshold 0.45 | removes 43 junk **and 818 real images** (~5% precision) |

Visual review of the lowest-confidence detections showed they are overwhelmingly *real but
hard* faces — profile views, hands over the face, glasses, tilted heads, wide-open screaming
mouths. BlazeFace confidence tracks **pose, occlusion and expression intensity**, not image
validity. Filtering on it would preferentially delete the pose and occlusion cases identified
as the main deployment risk ([F5], [F6]) together with the most intense expressions.

**Applied cleaning policy** (TRAIN only; VAL and TEST left canonical to preserve
comparability with published FER-2013 benchmarks):

1. cross-group duplicates dropped from TRAIN, keeping the VAL/TEST copy — 703 files
2. within-TRAIN duplicate redundancy, keeping one representative — 1,064 files
3. anomaly-flagged images — 53 files

BlazeFace is **measured but not applied**: of the 17 images it alone would have removed,
16 were already caught by the rules above, so it contributed exactly **one** unique image out
of 28,709. It is recorded in `cleaning_report.json` under `rules_measured_but_not_applied`.

Train: **28,709 -> 26,901** (1,808 distinct images removed). No file is deleted from
`data/raw/`; cleaning is expressed as manifests (`splits_canonical.csv`,
`splits_cleaned.csv`, `image_flags.csv`).

**Consequence — imbalance worsened: 16.55:1 -> 20.01:1.** Duplication was concentrated in
the minority classes:

| class | canonical | cleaned | removed |
|---|---|---|---|
| surprise | 3,171 | 2,454 | 717 (22.6%) |
| disgust | 436 | **351** | 85 (19.5%) |
| fear | 4,097 | 3,803 | 294 (7.2%) |
| angry | 3,995 | 3,783 | 212 (5.3%) |
| sad | 4,830 | 4,672 | 158 (3.3%) |
| neutral | 4,965 | 4,814 | 151 (3.0%) |
| happy | 7,215 | 7,024 | 191 (2.6%) |

`happy`, already the largest class, lost the least; `disgust` now has 351 training images and
its per-class metrics should be expected to be unstable. Deduplication was necessary and
correct, but it made the class-imbalance problem harder. **Open for Phase 3** — do not
resample here.

Start at notebook `01`.

## Continue reading

→ `../README.md` — ML conventions and run-metadata format
→ `../../docs/system/MOOD_STATE_SPEC.md` — the target label space
→ `../../docs/project/BUILD_PLAN.md` Phase 3 — the full FER phase definition
