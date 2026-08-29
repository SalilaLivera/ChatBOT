"""MaternaLink mood fusion layer (B4).

A LIBRARY, not a service. It implements MOOD_STATE_SPEC.md A5-A7 (frozen) and
nothing else. It refuses to run without explicitly supplied Phase 7 parameters
(FUSION_B4_PLAN.md section 2). It cannot be validated for accuracy — no dataset
pairs a face and a Sinhala message from the same person at the same moment with
a ground-truth mood label.

Scope boundaries (do not add these here):
  * no HTTP / FastAPI layer
  * no safety state, no A3.2 precedence rule ([PROPOSED], separate)
  * no temporal smoothing (N_smooth, Phase 3, undecided)
  * no default parameters, ever
"""

from __future__ import annotations

from .contract import (
    ALL_FUSION_STATES,
    FUSION_OUTPUT_KEYS,
    FUSION_VERSION,
    SINHALA_LANGUAGE_CODES,
    SUBSTANTIVE_STATES,
    UNKNOWN_STATE,
    argmax_state,
    is_sinhala,
    validate_modality_evidence,
)
from .errors import (
    ALL_ERROR_CODES,
    ContractViolationError,
    FusionError,
    InvalidParameterError,
    MissingParameterError,
    MissingProvenanceError,
)
from .fusion import FusionResult, fuse
from .parameters import (
    REQUIRED_SYMBOLS,
    TESTING_PLACEHOLDER_PROVENANCE,
    FusionParameters,
)

__all__ = [
    "SUBSTANTIVE_STATES",
    "UNKNOWN_STATE",
    "ALL_FUSION_STATES",
    "FUSION_VERSION",
    "FUSION_OUTPUT_KEYS",
    "SINHALA_LANGUAGE_CODES",
    "argmax_state",
    "is_sinhala",
    "validate_modality_evidence",
    "FusionParameters",
    "REQUIRED_SYMBOLS",
    "TESTING_PLACEHOLDER_PROVENANCE",
    "fuse",
    "FusionResult",
    "FusionError",
    "MissingParameterError",
    "MissingProvenanceError",
    "InvalidParameterError",
    "ContractViolationError",
    "ALL_ERROR_CODES",
]
