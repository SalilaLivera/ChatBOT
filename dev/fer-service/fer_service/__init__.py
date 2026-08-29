"""MaternaLink FER inference service.

A standalone, training-free inference layer for the fine-tuned MobileNetV2 facial
expression recogniser (IT22638168).

Outputs SEVEN calibrated FER class probabilities. It does NOT output the
application's CALM / NEUTRAL / DISTRESSED mood states — that mapping is an
undecided downstream concern and is deliberately not implemented here.
"""

from .contract import CLASS_ORDER, MODEL_VERSION, SERVICE_VERSION
from .errors import (
    ContractViolationError,
    FERServiceError,
    ImageTooLargeError,
    ImageTooSmallError,
    InferenceError,
    InvalidImageError,
    MissingImageError,
    ModelLoadError,
    PreprocessingError,
    UnsupportedFormatError,
)
from .inference import FERClassifier, load_default
from .preprocessing import decode_image, preprocess, preprocess_bytes

__version__ = SERVICE_VERSION

__all__ = [
    "FERClassifier",
    "load_default",
    "preprocess",
    "preprocess_bytes",
    "decode_image",
    "CLASS_ORDER",
    "MODEL_VERSION",
    "SERVICE_VERSION",
    "FERServiceError",
    "MissingImageError",
    "UnsupportedFormatError",
    "InvalidImageError",
    "ImageTooLargeError",
    "ImageTooSmallError",
    "PreprocessingError",
    "ModelLoadError",
    "InferenceError",
    "ContractViolationError",
]
