"""Typed errors for the MaternaLink mood fusion layer (B4).

Mirrors ``dev/fer-service/fer_service/errors.py`` and
``dev/sentiment-service/sentiment_service/errors.py``. Every error carries a
stable machine-readable ``code``; a caller switches on the code, never on the
message text.

The fusion layer is a LIBRARY, not an HTTP service, so ``http_status`` is a
suggestion only — retained for parity with the two services and for whatever
later phase wires this behind an endpoint.
"""

from __future__ import annotations


class FusionError(Exception):
    """Base class. Carries a stable code and an HTTP status suggestion."""

    code = "fusion_error"
    http_status = 500
    message = "Mood fusion failed."

    def __init__(self, message: str | None = None, detail: str | None = None):
        self.message = message or self.__class__.message
        self.detail = detail
        super().__init__(self.message)

    def to_dict(self, include_detail: bool = False) -> dict:
        payload = {"error": {"code": self.code, "message": self.message}}
        if include_detail and self.detail:
            payload["error"]["detail"] = self.detail
        return payload


# -- parameter errors ---------------------------------------------------------


class MissingParameterError(FusionError):
    """A required fusion parameter was not supplied.

    This is the enforcement mechanism for FUSION_B4_PLAN.md section 2 and
    MOOD_STATE_SPEC.md A7: the fusion layer MUST refuse to construct without
    explicitly supplied parameters. There is no default weighting anywhere.
    The message names the missing symbol.
    """

    code = "missing_parameter"
    http_status = 500
    message = "A required fusion parameter was not supplied."


class InvalidParameterError(FusionError):
    """A supplied parameter is out of range or the weights do not sum to 1.

    MOOD_STATE_SPEC.md A7: ``W_face + W_text = 1``. A5: every threshold is a
    confidence in ``[0, 1]``.
    """

    code = "invalid_parameter"
    http_status = 500
    message = "A supplied fusion parameter is invalid."


class MissingProvenanceError(FusionError):
    """Parameters were supplied without the mandatory provenance statement.

    FUSION_B4_PLAN.md section 2: supplied values must record where they came
    from. For any test run the provenance is
    "PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE".
    """

    code = "missing_provenance"
    http_status = 500
    message = "Fusion parameters were supplied without a provenance statement."


# -- evidence contract errors ----------------------------------------------


class ContractViolationError(FusionError):
    """A modality evidence object does not match MOOD_STATE_SPEC.md A4.

    Raised for: missing/extra score keys, wrong score-key order, a confidence
    outside ``[0, 1]``, a ``predicted_state`` that is not the argmax of
    ``scores``, or — the case FUSION_B4_PLAN.md section 5.1 calls out — a text
    evidence object with no ``language`` field. The layer never defaults a
    missing ``language`` to "probably Sinhala".
    """

    code = "contract_violation"
    http_status = 500
    message = (
        "A modality evidence object does not match the A4 evidence contract. "
        "Fusion refused to run."
    )


#: Every code a caller may receive. Anything not in this set is a bug.
ALL_ERROR_CODES = frozenset(
    cls.code
    for cls in (
        MissingParameterError,
        InvalidParameterError,
        MissingProvenanceError,
        ContractViolationError,
        FusionError,
    )
)
