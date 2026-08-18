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

Nothing has been trained. FER-2013 research use is verified. Start at notebook `01`.

## Continue reading

→ `../README.md` — ML conventions and run-metadata format
→ `../../docs/system/MOOD_STATE_SPEC.md` — the target label space
→ `../../docs/project/BUILD_PLAN.md` Phase 3 — the full FER phase definition
