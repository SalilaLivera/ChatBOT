"""Fusion parameters — SUPPLIED, NEVER DEFAULTED.

FUSION_B4_PLAN.md section 2, and MOOD_STATE_SPEC.md A7:

    "The fusion layer must REFUSE TO RUN without explicitly supplied
     parameters. No default weights. Not 0.5/0.5, not 'equal weighting for
     now', not a constant marked TODO."

Every symbol below is [FUTURE-EXPERIMENTAL] per MOOD_STATE_SPEC.md B1, produced
by the Phase 7 fusion/weighting experiment (``tau_distress`` additionally
requires participant self-report — a user study). A7: "They must not be
assigned values in this document." This module therefore holds NO value; it
holds a constructor that demands them and validates them.

There is no module-level default, no ``FusionParameters()``-with-no-args path,
no sentinel that silently becomes a number. ``FusionParameters.require(...)``
raises :class:`MissingParameterError` naming the first missing symbol.

A caller MAY supply values for testing. When it does, ``provenance`` MUST say
so, verbatim:

    "PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE"
"""

from __future__ import annotations

from dataclasses import dataclass, fields

from .errors import (
    InvalidParameterError,
    MissingParameterError,
    MissingProvenanceError,
)

#: The six Part B symbols this layer needs, in the order MOOD_STATE_SPEC.md B1
#: lists them. ``require()`` reports the FIRST one missing.
REQUIRED_SYMBOLS: tuple[str, ...] = (
    "W_face",
    "W_text",
    "tau_face_min",
    "tau_text_min",
    "tau_fusion_min",
    "tau_distress",
)

#: The exact provenance string every test artifact must carry (FUSION_B4_PLAN.md
#: section 2 / the artifact block). A caller running tests MUST pass this.
TESTING_PLACEHOLDER_PROVENANCE = "PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE"

_WEIGHT_SUM_TOL = 1e-9
_UNIT_TOL = 1e-9

# A sentinel distinct from every legitimate value (including None), used so that
# "argument not passed" is distinguishable from "passed as None".
_MISSING = object()


@dataclass(frozen=True)
class FusionParameters:
    """A fully-specified, validated set of fusion parameters.

    Construct via :meth:`require`, never by guessing. All six B1 symbols are
    mandatory; ``provenance`` is mandatory and non-empty.

    Validated invariants (checked in ``__post_init__``):
      * ``W_face + W_text == 1``            -- MOOD_STATE_SPEC.md A7
      * every ``tau`` in ``[0, 1]``         -- MOOD_STATE_SPEC.md A5
      * ``W_face``, ``W_text`` in ``[0, 1]``
      * ``provenance`` is a non-empty string
    """

    W_face: float
    W_text: float
    tau_face_min: float
    tau_text_min: float
    tau_fusion_min: float
    tau_distress: float
    #: MANDATORY. Where each value came from. For tests, exactly
    #: TESTING_PLACEHOLDER_PROVENANCE.
    provenance: str

    def __post_init__(self) -> None:
        # provenance -----------------------------------------------------
        if not isinstance(self.provenance, str) or not self.provenance.strip():
            raise MissingProvenanceError(
                detail=(
                    "provenance must be a non-empty string stating where each "
                    "value came from. For tests: "
                    f"{TESTING_PLACEHOLDER_PROVENANCE!r}"
                )
            )

        # every numeric symbol must actually be a number ---------------
        for name in REQUIRED_SYMBOLS:
            v = getattr(self, name)
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                raise InvalidParameterError(
                    detail=f"parameter {name!r} must be a real number, got {v!r}"
                )

        # weights sum to 1 (A7) ---------------------------------------
        wsum = self.W_face + self.W_text
        if abs(wsum - 1.0) > _WEIGHT_SUM_TOL:
            raise InvalidParameterError(
                detail=(
                    f"W_face + W_text must equal 1 (MOOD_STATE_SPEC.md A7); got "
                    f"W_face={self.W_face} + W_text={self.W_text} = {wsum}"
                )
            )

        # weights individually in [0, 1] ----------------------------
        for name in ("W_face", "W_text"):
            v = getattr(self, name)
            if v < -_UNIT_TOL or v > 1.0 + _UNIT_TOL:
                raise InvalidParameterError(
                    detail=f"weight {name!r} outside [0, 1]: {v}"
                )

        # every tau in [0, 1] (A5) ----------------------------------
        for name in ("tau_face_min", "tau_text_min", "tau_fusion_min", "tau_distress"):
            v = getattr(self, name)
            if v < -_UNIT_TOL or v > 1.0 + _UNIT_TOL:
                raise InvalidParameterError(
                    detail=(
                        f"threshold {name!r} must be a confidence in [0, 1] "
                        f"(MOOD_STATE_SPEC.md A5); got {v}"
                    )
                )

    # -- the ONLY sanctioned constructor -------------------------------
    @classmethod
    def require(
        cls,
        *,
        W_face=_MISSING,
        W_text=_MISSING,
        tau_face_min=_MISSING,
        tau_text_min=_MISSING,
        tau_fusion_min=_MISSING,
        tau_distress=_MISSING,
        provenance=_MISSING,
    ) -> "FusionParameters":
        """Build parameters, refusing if any symbol is absent.

        Raises :class:`MissingParameterError` naming the first missing symbol
        (FUSION_B4_PLAN.md section 2 — "Missing parameters raise a typed error
        naming the missing symbol"), or :class:`MissingProvenanceError` if
        ``provenance`` is absent.
        """
        supplied = {
            "W_face": W_face,
            "W_text": W_text,
            "tau_face_min": tau_face_min,
            "tau_text_min": tau_text_min,
            "tau_fusion_min": tau_fusion_min,
            "tau_distress": tau_distress,
        }
        for name in REQUIRED_SYMBOLS:
            if supplied[name] is _MISSING:
                raise MissingParameterError(
                    message=(
                        f"Fusion parameter '{name}' was not supplied. It is a "
                        "MOOD_STATE_SPEC.md B1 [FUTURE-EXPERIMENTAL] symbol, "
                        "produced by the Phase 7 experiment. The fusion layer "
                        "does not default it."
                    ),
                    detail=(
                        "no default exists for any of "
                        f"{list(REQUIRED_SYMBOLS)}; supply all six explicitly"
                    ),
                )
        if provenance is _MISSING:
            raise MissingProvenanceError(
                detail=(
                    "provenance is mandatory. For tests pass "
                    f"{TESTING_PLACEHOLDER_PROVENANCE!r}"
                )
            )
        return cls(provenance=provenance, **supplied)

    # -- convenience for artifacts -----------------------------------
    def as_dict(self) -> dict:
        return {f.name: getattr(self, f.name) for f in fields(self)}
