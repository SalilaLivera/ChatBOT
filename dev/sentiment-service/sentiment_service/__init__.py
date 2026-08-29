"""MaternaLink Sinhala sentiment inference service.

A standalone, training-free inference layer for the Experiment 02 SinBERT-small
3-class mood checkpoint (IT22638168).

Outputs THREE probabilities in the order CALM / NEUTRAL / DISTRESSED. It does NOT
perform the FER 7->3 mapping, FER/sentiment fusion, temporal smoothing, threshold
tuning, or language detection — see contract.OUT_OF_SCOPE. It is Sinhala-only in
practice (see contract.ENGLISH_IN_SCOPE).
"""

from .contract import (
    CHECKPOINT_SHA256,
    LABEL_ORDER,
    MAX_LENGTH,
    MODEL_VERSION,
    SERVICE_VERSION,
)
from .errors import (
    ContractViolationError,
    EmptyTextError,
    InferenceError,
    MissingTextError,
    ModelLoadError,
    SentimentServiceError,
    TextTooLongError,
    TokenisationError,
)
from .inference import SentimentClassifier, load_default, sha256_file
from .preprocessing import check_text, encode

__version__ = SERVICE_VERSION

__all__ = [
    "SentimentClassifier",
    "load_default",
    "sha256_file",
    "check_text",
    "encode",
    "LABEL_ORDER",
    "MAX_LENGTH",
    "MODEL_VERSION",
    "SERVICE_VERSION",
    "CHECKPOINT_SHA256",
    "SentimentServiceError",
    "MissingTextError",
    "EmptyTextError",
    "TextTooLongError",
    "TokenisationError",
    "ModelLoadError",
    "InferenceError",
    "ContractViolationError",
]
