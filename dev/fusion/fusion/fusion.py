"""The mood fusion rule — MOOD_STATE_SPEC.md A5, A6, A7, transcribed.

This module invents nothing. It implements the frozen late-fusion rule (A7),
the frozen missing-modality table (A6), and the frozen `unknown` conditions
(A5). Each behaviour cites its clause.

    Fused(c) = W_face * Face(c) + W_text * Text(c)   for c in {calm, neutral, distressed}
    subject to W_face + W_text = 1                                              -- A7

    When only one modality is usable, that modality's scores pass through
    UNCHANGED; the weights do not apply.                                        -- A7

`unknown` is produced when, and only when, NO modality result is usable.       -- A5
"""

from __future__ import annotations

from dataclasses import dataclass

from . import contract
from .contract import (
    FUSION_VERSION,
    SUBSTANTIVE_STATES,
    UNKNOWN_STATE,
    argmax_state,
    is_sinhala,
    validate_modality_evidence,
)
from .errors import ContractViolationError, InvalidParameterError
from .parameters import FusionParameters


@dataclass(frozen=True)
class FusionResult:
    """Outcome of one fusion call.

    ``to_contract()`` returns EXACTLY the A7 output object. The extra fields
    here (``scores``, ``face_usable``, ``text_usable``, ``reason``) are for
    tests and callers that need to inspect the computation; they are NOT part
    of the wire contract and F7 asserts they never leak into ``to_contract()``.
    """

    state: str
    confidence: float
    modalities_used: tuple[str, ...]
    fusion_version: str
    #: The three-vector actually produced (fused, or a single modality passed
    #: through unchanged). ``None`` when the state is ``unknown`` — A4: there is
    #: no score vector for `unknown`.
    scores: dict[str, float] | None
    face_usable: bool
    text_usable: bool
    #: Short machine string naming which A5/A6 branch fired.
    reason: str

    def to_contract(self) -> dict:
        """The A7 output object — no extra fields, none missing (F7)."""
        return {
            "state": self.state,
            "confidence": self.confidence,
            "modalities_used": list(self.modalities_used),
            "fusion_version": self.fusion_version,
        }


def _face_usable(face_evidence, params: FusionParameters) -> bool:
    """A5/A6: face usable iff present and confidence >= tau_face_min.

    ``None`` means the camera is disabled/denied/unavailable OR the face model
    errored (A5 groups these). "The camera-disabled path is normal operation,
    not a failure" (A6).
    """
    if face_evidence is None:
        return False
    validate_modality_evidence(face_evidence, modality="face")
    return face_evidence["confidence"] >= params.tau_face_min


def _text_usable(text_evidence, params: FusionParameters) -> bool:
    """A5/A6 + FUSION_B4_PLAN.md 5.1: text usable iff present, Sinhala, and
    confidence >= tau_text_min.

    The language gate is applied BEFORE the confidence gate and is not a
    confidence check: B2-A section 4 measured the sentiment service returning
    confident CALM (~0.6) for English it cannot handle, with no in-band signal.
    A confidence threshold cannot catch that; the ``language`` field can and A4
    requires it to be present.

    A missing ``language`` field is a contract violation (raised inside
    ``validate_modality_evidence``), never defaulted to Sinhala.
    """
    if text_evidence is None:
        return False
    validate_modality_evidence(text_evidence, modality="text")
    if not is_sinhala(text_evidence["language"]):
        # Not usable regardless of confidence (F11).
        return False
    return text_evidence["confidence"] >= params.tau_text_min


def fuse(face_evidence, text_evidence, params: FusionParameters) -> FusionResult:
    """Fuse face and text mood evidence into one application mood state.

    Parameters
    ----------
    face_evidence, text_evidence:
        Either an A4 modality evidence dict, or ``None`` when that modality is
        unavailable / disabled / erroring (A6).
    params:
        A fully-specified :class:`FusionParameters`. There is no default; a
        caller that has not run the Phase 7 experiment must pass placeholder
        values with placeholder provenance.

    Returns
    -------
    FusionResult
        ``.to_contract()`` is the A7 output object.
    """
    if not isinstance(params, FusionParameters):
        raise InvalidParameterError(
            detail=(
                "fuse() requires a FusionParameters instance built via "
                "FusionParameters.require(...); there is no default weighting"
            )
        )

    face_usable = _face_usable(face_evidence, params)
    text_usable = _text_usable(text_evidence, params)

    # -- A6 row 4 / A5: no usable modality -> `unknown` -------------------
    if not face_usable and not text_usable:
        return FusionResult(
            state=UNKNOWN_STATE,
            confidence=0.0,
            modalities_used=(),
            fusion_version=FUSION_VERSION,
            scores=None,
            face_usable=face_usable,
            text_usable=text_usable,
            reason="a5_no_usable_modality",
        )

    # -- A6 row 2: face unusable, text usable -> TEXT SCORES UNCHANGED ---
    if not face_usable and text_usable:
        scores = {s: float(text_evidence["scores"][s]) for s in SUBSTANTIVE_STATES}
        # A7: "the weights do not apply to the single-modality case."
        # A6: single-modality results are NOT down-weighted or penalised;
        #     reported with the surviving modality's OWN confidence.
        #
        # AMENDMENT 1 A1.4: passthrough returns the modality's OWN predicted_state
        # rather than re-deriving it from scores. With no second modality there is
        # nothing to weigh against, so re-argmaxing could only override the
        # modality's own decision by arithmetic rather than by evidence.
        # For text these are identical (A4 still enforced); the distinction is
        # load-bearing for FACE, where predicted_state is the FROZEN Rule-A label.
        return FusionResult(
            state=str(text_evidence["predicted_state"]),
            confidence=float(text_evidence["confidence"]),
            modalities_used=("text",),
            fusion_version=FUSION_VERSION,
            scores=scores,
            face_usable=face_usable,
            text_usable=text_usable,
            reason="a6_text_only_passthrough_unweighted",
        )

    # -- A6 row 3: text unusable, face usable -> FACE SCORES UNCHANGED ---
    if face_usable and not text_usable:
        scores = {s: float(face_evidence["scores"][s]) for s in SUBSTANTIVE_STATES}
        # AMENDMENT 1 A1.4 INVARIANT: "For face-only operation, the output state MUST
        # remain the Rule-A standalone FER state." predicted_state IS that label.
        # Re-deriving it with argmax_state(scores) would return the grouped-sum argmax
        # (Rule B) and silently bypass the FROZEN D-4 decision in exactly the path
        # where it is meant to be authoritative.
        return FusionResult(
            state=str(face_evidence["predicted_state"]),
            confidence=float(face_evidence["confidence"]),
            modalities_used=("face",),
            fusion_version=FUSION_VERSION,
            scores=scores,
            face_usable=face_usable,
            text_usable=text_usable,
            reason="a6_face_only_passthrough_unweighted",
        )

    # -- A6 row 1: both usable -> weighted late fusion (A7) -------------
    fused = {
        s: params.W_face * float(face_evidence["scores"][s])
        + params.W_text * float(text_evidence["scores"][s])
        for s in SUBSTANTIVE_STATES
    }
    # W_face + W_text == 1 and each input vector sums to 1, so `fused` sums to
    # 1 by construction. Renormalise only against floating-point drift so F9
    # holds exactly.
    total = sum(fused.values())
    if total <= 0:
        raise ContractViolationError(
            detail=f"fused scores sum to {total}; cannot form a distribution"
        )
    fused = {s: v / total for s, v in fused.items()}

    state = argmax_state(fused)
    fused_confidence = fused[state]

    # -- A5 final bullet: fused confidence below tau_fusion_min -> `unknown`
    # "fusion confidence below `tau_fusion_min` where that check applies."
    # This check applies ONLY to the both-usable fused path, never to a
    # single-modality passthrough (A6: single-modality is not penalised).
    if fused_confidence < params.tau_fusion_min:
        return FusionResult(
            state=UNKNOWN_STATE,
            confidence=0.0,
            modalities_used=(),
            fusion_version=FUSION_VERSION,
            scores=None,
            face_usable=face_usable,
            text_usable=text_usable,
            reason="a5_fused_confidence_below_tau_fusion_min",
        )

    return FusionResult(
        state=state,
        confidence=float(fused_confidence),
        modalities_used=("face", "text"),
        fusion_version=FUSION_VERSION,
        scores=fused,
        face_usable=face_usable,
        text_usable=text_usable,
        reason="a6_both_usable_weighted_fusion",
    )


# Re-export for callers that only import this module.
__all__ = ["FusionResult", "fuse", "FusionParameters", "contract"]
