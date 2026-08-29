"""Frozen constants for the MaternaLink Sinhala sentiment inference service.

Every value here is copied from a measured artifact, not chosen. Nothing in this
file may be changed without a corresponding change to the underlying checkpoint and
to the sentiment inference contract documentation.

Source of truth for the checkpoint identity:
    ml/sentiment/outputs/development_v2/experiment_02/best_checkpoint/config.json
    docs/ml/sentiment/SENTIMENT_HANDOVER_CURRENT.md  (section 9)
Source of truth for the tokenisation call:
    ml/sentiment/scripts/final_evaluate_sinbert_experiment02.py
    ml/sentiment/notebooks/04_sinbert_experiment_02.ipynb  (collate())
Source of truth for measured performance:
    ml/sentiment/outputs/development_v2/experiment_02/metrics.json  (validation)
    ml/sentiment/outputs/final_evaluation/.../metrics.json          (frozen test)
"""

from __future__ import annotations

# --------------------------------------------------------------------------
# Model identity
# --------------------------------------------------------------------------

#: Human-readable service version. Bump on ANY change to the checkpoint or to the
#: preprocessing contract.
SERVICE_VERSION = "0.1.0"

#: The Experiment 02 development/demo checkpoint this contract describes.
CHECKPOINT_NAME = "sinbert_small_maternalink_mood_exp02"

#: SHA-256 of the exact model.safetensors this contract describes. Verified at
#: load time; the service refuses to serve on mismatch. From
#: docs/ml/sentiment/SENTIMENT_HANDOVER_CURRENT.md section 9.
CHECKPOINT_SHA256 = (
    "624da0651206746aa211a9fe472280a488effb75f4ef230f933d565688a965b9"
)

#: Upstream encoder the checkpoint fine-tuned, for provenance only.
BASE_MODEL_ID = "sinhala-nlp/sinhala-sentiment-analysis-sinbert-small"
BASE_MODEL_REVISION = "7059f20a28a2b1e2ff2f45b13d6956435cdacb6a"

#: Composite identifier suitable for returning in a response so a backend can pin.
MODEL_VERSION = f"{CHECKPOINT_NAME}/{SERVICE_VERSION}"

ARCHITECTURE = "RobertaForSequenceClassification"
PROVENANCE = {
    "base_model_id": BASE_MODEL_ID,
    "base_model_revision": BASE_MODEL_REVISION,
    "classification_head": "new RobertaClassificationHead with 3 outputs",
    "training_notebook": "ml/sentiment/notebooks/04_sinbert_experiment_02.ipynb",
    "training_run": "Experiment 02 (development only)",
    "dev_v2_dataset_sha256": (
        "bdf2df52913eb686bacbfbb481764d4d425b61207ad4506c9d8ef325b7c9f5aa"
    ),
    "dev_v2_split_sha256": (
        "46b03fb9f4ecfeded82c7e4209767d567194250892fc4ac2efa93c7f74d2d81d"
    ),
    "encoder_layers": 6,
    "attention_heads": 6,
    "hidden_size": 768,
    "vocab_size": 30000,
}

# --------------------------------------------------------------------------
# Label contract
# --------------------------------------------------------------------------

#: ORDER IS LOAD-BEARING. The logit / probability vector is indexed by this list.
#: Copied verbatim from best_checkpoint/config.json id2label:
#:     {"0": "CALM", "1": "NEUTRAL", "2": "DISTRESSED"}
LABEL_ORDER = ("CALM", "NEUTRAL", "DISTRESSED")

N_CLASSES = len(LABEL_ORDER)

#: The deployed application evidence contract. MOOD_STATE_SPEC.md section A4 fixes
#: the mood-state evidence vector as {calm, neutral, distressed} IN THIS SAME
#: ORDER. The checkpoint's id2label is CALM=0, NEUTRAL=1, DISTRESSED=2 — the same
#: order, differing only in letter case. This mapping is recorded explicitly here
#: so that no reader has to infer it: index i of the probability vector is
#: DEPLOYED_EVIDENCE_KEYS[i].
DEPLOYED_EVIDENCE_KEYS = ("calm", "neutral", "distressed")
LABEL_TO_EVIDENCE_KEY = dict(zip(LABEL_ORDER, DEPLOYED_EVIDENCE_KEYS))

# --------------------------------------------------------------------------
# Tokenisation contract
# --------------------------------------------------------------------------

#: max_length passed to the tokenizer, truncation on. From the reference script
#: and the training collate().
MAX_LENGTH = 512
TRUNCATION = True

#: The reference performs NO text normalisation of any kind — no stripping, no
#: lowercasing, no Unicode normalisation (NFC/NFKC), no whitespace collapsing.
#: Sinhala is especially sensitive to Unicode normalisation form. This service
#: therefore performs none either. Do not add any.
TEXT_NORMALISATION = "none"

#: Prediction rule. No threshold tuning: softmax over the logits, then argmax.
PREDICTION_RULE = "softmax then argmax"
DEVICE = "cpu"
DTYPE = "float32"

# --------------------------------------------------------------------------
# Language scope
# --------------------------------------------------------------------------

#: SINHALA ONLY, established by measurement not intent. The one-time frozen-test
#: run predicted CALM for ALL 60 English records (see
#: docs/ml/sentiment/SENTIMENT_HANDOVER_CURRENT.md section 11 and the frozen
#: evaluation findings). English input is OUT OF SCOPE and must not be treated as
#: a supported case.
SUPPORTED_LANGUAGE = "si"
ENGLISH_IN_SCOPE = False

# --------------------------------------------------------------------------
# Measured performance — documentation and honest reporting only. Never recomputed
# at runtime, never presented as a live metric.
# --------------------------------------------------------------------------

MEASURED_PERFORMANCE = {
    "dev_v2_validation": {
        "n": 76,
        "accuracy": 0.684211,
        "macro_f1": 0.624851,
        "weighted_f1": 0.684682,
        "per_class_f1": {"CALM": 0.516129, "NEUTRAL": 0.777778, "DISTRESSED": 0.580645},
        "note": "development/validation split, not held-out",
    },
    "frozen_test_one_time": {
        "n": 120,
        "accuracy": 0.375000,
        "macro_f1": 0.362024,
        "weighted_f1": 0.362024,
        "note": (
            "one authorised held-out evaluation; CLOSED. 120 = 60 Sinhala + 60 "
            "English; the model predicted CALM for all 60 English records."
        ),
    },
}

#: Limits that must accompany any reported result. Not optional.
KNOWN_LIMITATIONS = (
    "Development/demo Sinhala mood classifier. NOT a validated final model, NOT a "
    "clinical model, NOT a production sentiment API.",
    "Frozen-test macro-F1 (0.362) is far below validation macro-F1 (0.625): weak "
    "generalisation from the Dev-v2 validation split to held-out data.",
    "Sinhala only. English input is out of scope; the model collapses English to "
    "CALM.",
    "Trained on 223 Sinhala records; validation on 76. Small data.",
    "Output is an application 'dominant mood' estimate under Annotation Guideline "
    "V2.1. It is NOT generic sentiment, NOT medical severity, NOT diagnosis, and "
    "NOT clinical risk.",
    "NEUTRAL-dominant training distribution (137/223); minority-class behaviour is "
    "unreliable.",
)

# --------------------------------------------------------------------------
# Explicit non-responsibilities. Enforced by absence, documented so nobody adds
# them later by accident.
# --------------------------------------------------------------------------

OUT_OF_SCOPE = (
    "any HTTP service layer (that is B2)",
    "the FER 7-class -> 3-state mapping (that is B3)",
    "FER / sentiment fusion or fusion weights (that is B4)",
    "text-language detection or routing",
    "text normalisation of any kind",
    "threshold tuning or decision-boundary calibration",
    "retraining, fine-tuning, or re-evaluation of the checkpoint",
    "any storage of text or predictions",
)
