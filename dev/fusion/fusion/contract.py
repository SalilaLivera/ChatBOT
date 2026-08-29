"""Frozen contract for the MaternaLink mood fusion layer (B4).

Every shape and constant here is transcribed from MOOD_STATE_SPEC.md Part A
(frozen at Gate 1A). Section numbers are cited inline. Nothing here may be
changed without a decision memo in ``docs/decisions/`` (Part A change control).

NAMING NOTE: MOOD_STATE_SPEC.md section B4 is an unrelated open question
("is `calm` separable from `neutral`?"). This module implements the fusion
LAYER, also nicknamed B4 in the build plan. They are not the same thing.

This module contains NO threshold, NO weight, and NO accuracy value, matching
the Part A rule that "Part A contains no numeric threshold, weight, or accuracy
value, and must not acquire one."
"""

from __future__ import annotations

from typing import Any

from .errors import ContractViolationError

# --------------------------------------------------------------------------
# States  (MOOD_STATE_SPEC.md A1)
# --------------------------------------------------------------------------

#: The three SUBSTANTIVE application mood states. ORDER IS LOAD-BEARING.
#: A4: "The class order in the score vector is fixed as `calm, neutral,
#: distressed` wherever an ordered array is used."
SUBSTANTIVE_STATES: tuple[str, str, str] = ("calm", "neutral", "distressed")

#: A1.4 / A5: `unknown` is a FUSION DETERMINATION made when no modality
#: evidence is usable. A4: "`unknown` is never a model output class." It never
#: appears in a modality `scores` vector; it only ever appears as a fusion
#: `state`.
UNKNOWN_STATE: str = "unknown"

#: Every value the fusion `state` field may take (A7 / A1).
ALL_FUSION_STATES: tuple[str, str, str, str] = SUBSTANTIVE_STATES + (UNKNOWN_STATE,)

# --------------------------------------------------------------------------
# Fusion version  (MOOD_STATE_SPEC.md A7)
# --------------------------------------------------------------------------

#: A7 fixes the literal string. NFR-11: fusion is versioned independently of
#: any model.
FUSION_VERSION: str = "fusion-v1"

# --------------------------------------------------------------------------
# Language scope  (MOOD_STATE_SPEC.md A4 + FUSION_B4_PLAN.md section 5.1)
# --------------------------------------------------------------------------

#: A4: "The text modality additionally carries `language`."
#: The sentiment service (dev/sentiment-service) is Sinhala-only by measurement
#: (B2-A section 4: it returns confident CALM for English it cannot handle,
#: with no in-band signal). The fusion layer therefore treats any text evidence
#: whose language is not Sinhala as NOT USABLE, regardless of confidence
#: (FUSION_B4_PLAN.md section 5.1). This is a fusion-layer judgement about what
#: counts as usable evidence, squarely inside A5's remit. It does NOT modify the
#: sentiment model or service.
SINHALA_LANGUAGE_CODES: frozenset[str] = frozenset(
    {"si", "sin", "si-lk", "sinhala", "sinhalese"}
)

# --------------------------------------------------------------------------
# A4 modality evidence contract
# --------------------------------------------------------------------------
#
# Each modality produces evidence in this shape (A4):
#
#     {
#       "scores": { "calm": 0.0, "neutral": 0.0, "distressed": 0.0 },
#       "predicted_state": "calm | neutral | distressed",
#       "confidence": 0.0,
#       "model_version": "string"
#     }
#
# The TEXT modality additionally carries "language" (A4).
#
# A6: a modality that is unavailable / disabled / erroring is represented to
# this layer as ``None`` (not as an evidence dict). "The camera-disabled path
# is normal operation, not a failure."

#: Required keys on every modality evidence object (A4).
_REQUIRED_EVIDENCE_KEYS: frozenset[str] = frozenset(
    {"scores", "predicted_state", "confidence", "model_version"}
)

#: Additional required key on TEXT evidence only (A4).
_REQUIRED_TEXT_EVIDENCE_KEYS: frozenset[str] = _REQUIRED_EVIDENCE_KEYS | {"language"}

_FLOAT_TOL = 1e-9


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def argmax_state(scores: dict[str, float]) -> str:
    """Return the substantive state with the highest score.

    A4: "`predicted_state` is the argmax of `scores`." Ties are broken by the
    fixed class order ``calm, neutral, distressed`` (the first maximum wins),
    which matches numpy ``argmax`` semantics and is stated so no reader has to
    infer it.
    """
    best_state = SUBSTANTIVE_STATES[0]
    best_value = scores[best_state]
    for state in SUBSTANTIVE_STATES[1:]:
        if scores[state] > best_value:
            best_value = scores[state]
            best_state = state
    return best_state


def validate_modality_evidence(evidence: Any, *, modality: str) -> None:
    """Validate one modality evidence object against A4.

    ``modality`` is ``"face"`` or ``"text"``. Text evidence must additionally
    carry ``language`` (A4); its absence is a contract violation, never
    defaulted (FUSION_B4_PLAN.md section 5.1).

    Raises :class:`ContractViolationError` on any deviation.
    """
    if modality not in ("face", "text"):
        raise ContractViolationError(
            detail=f"unknown modality name {modality!r}; expected 'face' or 'text'"
        )

    if not isinstance(evidence, dict):
        raise ContractViolationError(
            detail=(
                f"{modality} evidence must be a dict matching A4, or None when the "
                f"modality is unavailable; got {type(evidence).__name__}"
            )
        )

    required = (
        _REQUIRED_TEXT_EVIDENCE_KEYS if modality == "text" else _REQUIRED_EVIDENCE_KEYS
    )
    keys = set(evidence.keys())
    missing = required - keys
    extra = keys - required
    if missing:
        # A4 section 5.1: a text evidence object with no `language` lands here.
        raise ContractViolationError(
            detail=f"{modality} evidence missing required A4 key(s): {sorted(missing)}"
        )
    if extra:
        raise ContractViolationError(
            detail=(
                f"{modality} evidence has undocumented key(s) not in the A4 "
                f"contract: {sorted(extra)}"
            )
        )

    # -- scores: probability-like vector over the THREE substantive states ----
    scores = evidence["scores"]
    if not isinstance(scores, dict):
        raise ContractViolationError(
            detail=f"{modality} evidence 'scores' must be a dict, got "
            f"{type(scores).__name__}"
        )
    score_keys = list(scores.keys())
    if tuple(score_keys) != SUBSTANTIVE_STATES:
        # A4: order fixed as calm, neutral, distressed. Both the SET and the
        # ORDER are checked — dict insertion order is meaningful here.
        raise ContractViolationError(
            detail=(
                f"{modality} evidence 'scores' keys must be exactly "
                f"{list(SUBSTANTIVE_STATES)} in that order (A4); got {score_keys}"
            )
        )
    for state in SUBSTANTIVE_STATES:
        v = scores[state]
        if not _is_number(v):
            raise ContractViolationError(
                detail=f"{modality} score for {state!r} is not a number: {v!r}"
            )
        if v < -_FLOAT_TOL or v > 1.0 + _FLOAT_TOL:
            raise ContractViolationError(
                detail=(
                    f"{modality} score for {state!r} is outside [0, 1]: {v} "
                    "(A4: scores are probability-like)"
                )
            )
    total = sum(scores[s] for s in SUBSTANTIVE_STATES)
    if abs(total - 1.0) > 1e-6:
        raise ContractViolationError(
            detail=(
                f"{modality} evidence 'scores' sum to {total}, not 1.0 "
                "(A4: probability-like vector over the three substantive states)"
            )
        )

    # -- confidence in [0, 1] (A4) ------------------------------------------
    confidence = evidence["confidence"]
    if not _is_number(confidence):
        raise ContractViolationError(
            detail=f"{modality} evidence 'confidence' is not a number: {confidence!r}"
        )
    if confidence < -_FLOAT_TOL or confidence > 1.0 + _FLOAT_TOL:
        raise ContractViolationError(
            detail=f"{modality} evidence 'confidence' outside [0, 1]: {confidence} (A4)"
        )

    # -- predicted_state is the argmax of scores (A4) ----------------------
    predicted_state = evidence["predicted_state"]
    if predicted_state not in SUBSTANTIVE_STATES:
        raise ContractViolationError(
            detail=(
                f"{modality} evidence 'predicted_state' must be one of "
                f"{list(SUBSTANTIVE_STATES)} (A4: `unknown` is never a model output "
                f"class); got {predicted_state!r}"
            )
        )
    # AMENDMENT 1 (docs/decisions/FER_7TO3_MAPPING_DECISION.md, approved 2026-08-29):
    # A4's "predicted_state is the argmax of scores" is EXEMPTED FOR FACE EVIDENCE.
    #
    # FER is a 7-class model collapsed into 3 states, so its label and its score
    # vector come from two DIFFERENT computations and may legitimately disagree:
    #   predicted_state = Rule A  -- argmax of the 7 classes, then mapped (D-4, FROZEN)
    #   scores          = grouped sums of the 7 calibrated probabilities (soft evidence)
    # e.g. happy .25 is the 7-class argmax (-> CALM) while the distressed group
    # (angry+disgust+fear+sad) sums to .50. The evidence honestly says "my decision is
    # CALM, my mass leans DISTRESSED". Rejecting that would force one-hot face scores,
    # which makes the face an absolute veto whenever W_face >= 0.5 and removes text's
    # ability to recover FER's measured 24.3% distress miss rate.
    #
    # TEXT evidence is NOT exempt: the sentiment model is natively 3-class, its label
    # and scores come from one softmax, and divergence there is a real defect.
    if modality != "face":
        expected = argmax_state(scores)
        if predicted_state != expected:
            raise ContractViolationError(
                detail=(
                    f"{modality} evidence 'predicted_state' is {predicted_state!r} but "
                    f"the argmax of 'scores' is {expected!r} (A4). Only FACE evidence is "
                    f"exempt from this rule, per AMENDMENT 1 of "
                    f"docs/decisions/FER_7TO3_MAPPING_DECISION.md"
                )
            )

    # -- model_version -----------------------------------------------------
    if not isinstance(evidence["model_version"], str) or not evidence["model_version"]:
        raise ContractViolationError(
            detail=f"{modality} evidence 'model_version' must be a non-empty string (A4)"
        )

    # -- text-only: language must be present AND a string ------------------
    if modality == "text":
        language = evidence["language"]
        if not isinstance(language, str) or not language.strip():
            raise ContractViolationError(
                detail=(
                    "text evidence 'language' must be a non-empty string (A4); "
                    "it is never defaulted to Sinhala (FUSION_B4_PLAN.md 5.1)"
                )
            )


def is_sinhala(language: str) -> bool:
    """True iff ``language`` denotes Sinhala.

    Non-Sinhala text evidence is not usable at the fusion boundary regardless
    of confidence (FUSION_B4_PLAN.md section 5.1 / B2-A section 4).
    """
    return language.strip().lower() in SINHALA_LANGUAGE_CODES


# --------------------------------------------------------------------------
# A7 fusion output contract
# --------------------------------------------------------------------------
#
#     {
#       "state": "calm | neutral | distressed | unknown",
#       "confidence": 0.0,
#       "modalities_used": ["face", "text"],
#       "fusion_version": "fusion-v1"
#     }
#
# EXACT key set — F7 asserts no field is added and none is missing.

FUSION_OUTPUT_KEYS: tuple[str, ...] = (
    "state",
    "confidence",
    "modalities_used",
    "fusion_version",
)
