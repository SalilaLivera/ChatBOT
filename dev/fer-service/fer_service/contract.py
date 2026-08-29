"""Frozen constants for the MaternaLink FER inference service.

Every value here is copied from a measured artifact, not chosen. The provenance of
each is named. Nothing in this file may be changed without a corresponding change to
the underlying model artifact and to docs/ml/FER_INFERENCE_CONTRACT.md.

Source of truth for the tensor spec: ml/fer/outputs/nb07_tensor_spec.json
Source of truth for the metrics:     ml/fer/outputs/nb07_tflite_comparison.csv
                                     ml/fer/outputs/nb05_test_metrics.json
"""

from __future__ import annotations

# --------------------------------------------------------------------------
# Model identity
# --------------------------------------------------------------------------

#: Human-readable service version. Bump on ANY change to the model artifact or
#: to the preprocessing contract. The backend pins against this.
SERVICE_VERSION = "1.0.0"

#: The deployed artifact. float32 was selected for SERVER-SIDE deployment because
#: Hugging Face Spaces run on x86, where notebook 07 measured float32 as both the
#: most accurate AND the fastest variant. This is NOT the mobile variant decision,
#: which remains open pending an on-device benchmark (P-02).
MODEL_FILENAME = "fer_mobilenetv2_96_float32.tflite"

#: SHA-256 of the exact artifact this contract describes. Verified at load time.
#: Computed 2026-08-28 from ml/fer/models/fer_mobilenetv2_96_float32.tflite.
MODEL_SHA256 = "47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c"

MODEL_SIZE_BYTES = 8_956_864

#: Composite identifier returned in every response so the backend can pin a version.
MODEL_VERSION = f"fer-mobilenetv2-96-float32/{SERVICE_VERSION}"

#: Provenance chain, for auditability. See ml/fer/outputs/run_*.json.
PROVENANCE = {
    "source_keras_model": "fer_mobilenetv2_finetuned_96.keras",
    "source_keras_sha256": (
        "226467016084be4df6f38fe8e756233062f7d7a5cdc567e39d2788b6a02cdc2f"
    ),
    "training_run": "run_20260823_163030",       # notebook 04, fine-tuning
    "evaluation_run": "run_20260828_052743",     # notebook 05, single TEST touch
    "conversion_run": "run_20260828_142821",     # notebook 07, calibration + TFLite
    "benchmark_run": "run_20260828_181803",      # notebook 08, model-level benchmark
    "architecture": "MobileNetV2 (alpha=1.0, ImageNet init), fine-tuned",
    "training_dataset": "FER-2013, de-duplicated train split (26,901 images)",
    "total_parameters": 2_266_951,
}

# --------------------------------------------------------------------------
# Tensor contract  (nb07_tensor_spec.json)
# --------------------------------------------------------------------------

INPUT_SHAPE = (1, 96, 96, 3)
INPUT_DTYPE = "float32"
OUTPUT_SHAPE = (1, 7)
OUTPUT_DTYPE = "float32"

#: Source-image size the model was trained on. The preprocessing contract
#: deliberately downsamples to this BEFORE upsampling to MODEL_INPUT_SIZE.
#: See preprocessing.py for why this is not a redundant step.
NATIVE_SOURCE_SIZE = 48

MODEL_INPUT_SIZE = 96

#: ORDER IS LOAD-BEARING. The output vector is indexed by this list. It is the
#: alphabetical FER-2013 class order used in notebooks 03 through 08.
CLASS_ORDER = (
    "angry",
    "disgust",
    "fear",
    "happy",
    "neutral",
    "sad",
    "surprise",
)

N_CLASSES = len(CLASS_ORDER)

# --------------------------------------------------------------------------
# Calibration
# --------------------------------------------------------------------------

#: Temperature fitted on the VALIDATION split in notebook 07 and BAKED INTO the
#: exported graph. The service does NOT apply it again — doing so would double-scale
#: the logits. It is recorded here for documentation only.
TEMPERATURE = 5.7271046975851005

CALIBRATION = {
    "method": "temperature scaling",
    "temperature": TEMPERATURE,
    "fitted_on": "validation split (PublicTest, 3,589 images)",
    "ece_before": 0.3010,
    "ece_after": 0.0126,
    "argmax_changes": 0,
    "baked_into_graph": True,
}

# --------------------------------------------------------------------------
# Measured performance — for documentation and honest reporting only.
# These are NOT recomputed at runtime and must never be presented as live metrics.
# --------------------------------------------------------------------------

MEASURED_PERFORMANCE = {
    "test_macro_f1": 0.6036,
    "test_accuracy": 0.6289,
    "test_split": "FER-2013 PrivateTest (3,589 images), touched exactly once",
    "val_macro_f1_tflite_float32": 0.6121791078324027,
    "val_ece_tflite_float32": 0.009903764867556732,
    "argmax_agreement_vs_keras": 0.995,
    "noise_floor_macro_f1": 0.0065,
}

#: Limits that must accompany any reported result. Not optional.
KNOWN_LIMITATIONS = (
    "Trained on FER-2013, which is predominantly Western/Caucasian. External "
    "validity for Sri Lankan users is UNVALIDATED.",
    "Negative expressions (angry, disgust, fear, sad) are poorly discriminated "
    "from one another; per-class F1 is roughly 0.47-0.57.",
    "Source images are 48x48 grayscale; fine facial detail is not available "
    "to the model.",
    "Output is a facial-expression estimate. It is NOT an emotion measurement, "
    "NOT a mental-health assessment, and NOT a medical diagnosis.",
)

# --------------------------------------------------------------------------
# Input handling limits
# --------------------------------------------------------------------------

MAX_UPLOAD_BYTES = 8 * 1024 * 1024          # 8 MB
ACCEPTED_FORMATS = ("JPEG", "PNG", "BMP", "WEBP")
MIN_SOURCE_DIMENSION = 16                    # reject degenerate thumbnails

# --------------------------------------------------------------------------
# Explicit non-responsibilities. Enforced by absence, documented here so that
# nobody adds them later by accident.
# --------------------------------------------------------------------------

OUT_OF_SCOPE = (
    "face detection (the CALLER supplies a face crop; BlazeFace runs upstream)",
    "the 7-class -> 3-state calm/neutral/distressed mapping (OD-4, undecided)",
    "temporal smoothing across frames (N_smooth, undecided)",
    "confidence gating (tau_face_min, undecided)",
    "text-sentiment fusion",
    "any storage of images or predictions",
)
