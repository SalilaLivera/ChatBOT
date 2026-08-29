"""HTTP transport for the MaternaLink mood fusion library (C4).

Wraps dev/fusion/ (unmodified — not one line of it changes) in a thin
FastAPI layer. Adds NO numerical behaviour: no computation, no adjustment,
no rounding, no clamping, no re-derivation. It reads six environment
variables into a FusionParameters instance (params.py) and forwards
face_evidence / text_evidence straight to fuse().

Endpoints:
  POST /fuse      {"face_evidence": {...}|null, "text_evidence": {...}|null}
                  -> result.to_contract() VERBATIM — exactly the four A7 keys.
                  scores/face_usable/text_usable/reason MUST NOT leak (F7).
  GET  /health    liveness + parameters_provenance + parameters_are_placeholder
  GET  /contract  the library's own exported constants, not retyped
"""

from __future__ import annotations

import os

from fastapi import Body, FastAPI, Request
from fastapi.responses import JSONResponse

from fusion import (
    ALL_ERROR_CODES,
    ALL_FUSION_STATES,
    FUSION_OUTPUT_KEYS,
    FUSION_VERSION,
    REQUIRED_SYMBOLS,
    SINHALA_LANGUAGE_CODES,
    SUBSTANTIVE_STATES,
    ContractViolationError,
    FusionError,
    fuse,
)

from fusion_service.params import PARAMETERS_ARE_PLACEHOLDER, PARAMS

# Stack-trace / detail exposure is opt-in for local debugging ONLY. Default
# OFF: typed error `detail` strings must never reach an untrusted caller —
# mirrors FER_DEBUG / SENTIMENT_DEBUG.
INCLUDE_ERROR_DETAIL = os.environ.get("FUSION_DEBUG", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title="MaternaLink Mood Fusion Service",
    version=FUSION_VERSION,
    description=(
        "Thin HTTP transport over dev/fusion/ — a pure-arithmetic late-fusion "
        "layer. No accuracy figure exists for fused output."
    ),
)


@app.exception_handler(FusionError)
async def fusion_error_handler(_: Request, exc: FusionError):
    # ⛔ A contract_violation caused by OUR OWN malformed evidence stays a
    # 500 — FusionError.http_status is used as published (all fusion codes
    # are 500). It is a backend defect and is never laundered into a 400
    # that blames the caller.
    return JSONResponse(
        status_code=exc.http_status,
        content=exc.to_dict(include_detail=INCLUDE_ERROR_DETAIL),
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "fusion_version": FUSION_VERSION,
        "parameters_provenance": PARAMS.provenance,
        "parameters_are_placeholder": PARAMETERS_ARE_PLACEHOLDER,
    }


# ---------------------------------------------------------------------------
# GET /contract — sourced from the library's own constants, never retyped.
# ---------------------------------------------------------------------------


@app.get("/contract")
async def get_contract():
    return {
        "fusion_version": FUSION_VERSION,
        "substantive_states": list(SUBSTANTIVE_STATES),
        "all_fusion_states": list(ALL_FUSION_STATES),
        "fusion_output_keys": list(FUSION_OUTPUT_KEYS),
        "sinhala_language_codes": sorted(SINHALA_LANGUAGE_CODES),
        "required_symbols": list(REQUIRED_SYMBOLS),
        "error_codes": sorted(ALL_ERROR_CODES),
    }


# ---------------------------------------------------------------------------
# POST /fuse
# ---------------------------------------------------------------------------


@app.post("/fuse")
async def fuse_endpoint(body: dict | None = Body(default=None)):
    """face_evidence and text_evidence are EACH nullable — null is normal
    operation (camera off / text unavailable), not an error (§A6)."""
    if not isinstance(body, dict):
        raise ContractViolationError(detail="request body must be a JSON object")

    face_evidence = body.get("face_evidence")
    text_evidence = body.get("text_evidence")

    result = fuse(face_evidence, text_evidence, PARAMS)
    # ⛔ Verbatim to_contract() — NEVER dataclasses.asdict(result), a
    # response_model derived from the dataclass, or jsonable_encoder(result).
    # Each of those would leak scores/face_usable/text_usable/reason (F7).
    return result.to_contract()
