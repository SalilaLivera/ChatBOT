"""Reads the six fusion parameters + provenance from the environment ONCE at
import time, and constructs a `fusion.FusionParameters` via `.require(...)`
(the library's only sanctioned constructor — dev/fusion/ is not modified).

This module adds NO numerical behaviour of its own: it does not choose a
value, does not default one, and does not compute anything from them. It is
the deployment-boundary enforcement of a refusal the library already makes —
the process dies here, at boot, naming the missing symbol, rather than on
first request.

Two independent refusals live here (BACKEND_IMPLEMENTATION_PLAN.md §8.2):

  1. Any of the seven required environment variables absent -> SystemExit,
     naming the specific variable. (Mirrors FusionParameters.require()'s own
     MissingParameterError / MissingProvenanceError, at the env-var layer.)
  2. NODE_ENV=production AND FUSION_PARAM_PROVENANCE contains "PLACEHOLDER"
     -> SystemExit. Not a warning.

FUSION_PARAM_PROVENANCE deliberately carries the DEVELOPMENT PLACEHOLDER SET
specified in C4_PLAN.md §3.2 in every non-production environment (see
.env.example for the actual values — deliberately NOT repeated here as
literal assignments; see the O-7 parameter guard). None of these values is a
measurement, an estimate, or a proposal to Phase 7 — they exist only so
integration can proceed, and they are supplied via the untracked .env, never
hard-coded here.
"""

from __future__ import annotations

import os

from fusion import FusionParameters

#: Maps the FusionParameters.require() keyword to its environment variable
#: name. Read only here — nowhere else in this service reads process.env
#: equivalents for these six symbols.
_REQUIRED_ENV_VARS: dict[str, str] = {
    "W_face": "FUSION_W_FACE",
    "W_text": "FUSION_W_TEXT",
    "tau_face_min": "FUSION_TAU_FACE_MIN",
    "tau_text_min": "FUSION_TAU_TEXT_MIN",
    "tau_fusion_min": "FUSION_TAU_FUSION_MIN",
    "tau_distress": "FUSION_TAU_DISTRESS",
}

_PROVENANCE_ENV_VAR = "FUSION_PARAM_PROVENANCE"


def _read_parameters() -> FusionParameters:
    values: dict[str, float] = {}
    for py_name, env_name in _REQUIRED_ENV_VARS.items():
        raw = os.environ.get(env_name)
        if raw is None:
            raise SystemExit(
                f"FATAL: required environment variable {env_name} is not set. "
                f"No default exists for fusion parameter {py_name!r} — it is a "
                "[FUTURE-EXPERIMENTAL] symbol produced by the Phase 7 "
                "experiment and is never invented by this service."
            )
        try:
            values[py_name] = float(raw)
        except ValueError as exc:
            raise SystemExit(
                f"FATAL: environment variable {env_name}={raw!r} is not a valid number."
            ) from exc

    provenance = os.environ.get(_PROVENANCE_ENV_VAR)
    if provenance is None:
        raise SystemExit(
            f"FATAL: required environment variable {_PROVENANCE_ENV_VAR} is not set. "
            "provenance is mandatory — it states where each parameter value came from."
        )

    # Boot refusal #1 (§8.2 guard 1): production + a placeholder provenance
    # never starts. Not a warning.
    node_env = os.environ.get("NODE_ENV", "development")
    if node_env == "production" and "PLACEHOLDER" in provenance:
        raise SystemExit(
            "FATAL: NODE_ENV=production but FUSION_PARAM_PROVENANCE contains "
            "'PLACEHOLDER' — refusing to start with placeholder fusion "
            "parameters in production."
        )

    return FusionParameters.require(provenance=provenance, **values)


# Runs ONCE at import time (module-level, not lazy) — the crash, if any,
# happens at container boot, which in Docker is a visible crash-loop.
PARAMS: FusionParameters = _read_parameters()

#: Exposed for GET /health. True whenever the loaded provenance carries the
#: word "PLACEHOLDER" — independent of NODE_ENV, so a non-production run can
#: still report it accurately.
PARAMETERS_ARE_PLACEHOLDER: bool = "PLACEHOLDER" in PARAMS.provenance
