"""HTTP service for the MaternaLink Sinhala sentiment inference package (B2-A).

Wraps the B1-CERTIFIED library (`sentiment_service/preprocessing.py` and
`inference.py`) in a thin FastAPI transport. This file adds NO numerical
behaviour: it parses a JSON request, calls `SentimentClassifier.predict()`
verbatim, and serialises the returned dict at FULL float precision.

Deliberate differences from `dev/fer-service/app.py`, per
`docs/plan/SENTIMENT_B2_SERVICE_VERIFICATION_PLAN.md` §3:

  * No Gradio. Sentiment has no UI requirement and the HF Space plan is dead.
  * JSON body `{"text": "..."}`, never multipart — text does not need it and
    multipart would invite UTF-8 encoding ambiguity on Sinhala.
  * The response probabilities are NOT rounded. The FER service rounds to 6 dp;
    doing that here would make a 5e-7 rounding bound indistinguishable from
    B1's 4.47e-07 batch-of-1 residual and destroy B2's measurement.
  * `torch.set_num_threads(1)` at startup, reported in /health. Thread count
    changes BLAS reduction order — the same mechanism behind B1's residual —
    so the service is pinned to a single, deterministic numerical configuration.

Endpoints:
  POST /predict   JSON {"text": "..."}  -> the predict() dict, unrounded
  GET  /health    liveness, checkpoint SHA-256, torch thread count, model version
  GET  /contract  the full machine-readable contract, sourced from contract.py
"""

from __future__ import annotations

import os

# Pin the numerical configuration BEFORE torch is used for any inference and
# before the model is loaded. Single-threaded => deterministic BLAS reduction
# order regardless of the host core count. See plan §3.3 and B1 findings §4.2.
import torch

torch.set_num_threads(1)

from fastapi import Body, FastAPI, Request
from fastapi.responses import JSONResponse

from sentiment_service import contract, errors
from sentiment_service.errors import MissingTextError, SentimentServiceError
from sentiment_service.inference import load_default

# Stack-trace / detail exposure is opt-in for local debugging ONLY. Default OFF:
# typed error `detail` strings must never reach an untrusted caller.
INCLUDE_ERROR_DETAIL = os.environ.get("SENTIMENT_DEBUG", "").lower() in (
    "1",
    "true",
    "yes",
)

app = FastAPI(
    title="MaternaLink Sinhala Sentiment Inference Service",
    version=contract.SERVICE_VERSION,
    description=(
        "Three-class Sinhala mood classifier (CALM / NEUTRAL / DISTRESSED). "
        "Development/demo model. Not a clinical or production sentiment API."
    ),
)

_classifier = None


def get_classifier():
    """Lazy singleton. Loading the 254 MB checkpoint is the expensive step.

    `num_threads=1` is redundant with the module-level `set_num_threads(1)` but
    is passed explicitly so the pin is visible at the call site too.
    """
    global _classifier
    if _classifier is None:
        _classifier = load_default(num_threads=1)
    return _classifier


# ---------------------------------------------------------------------------
# Typed-error handler — every SentimentServiceError leaves as its stable code
# and http_status. Registered here and exercised by tools/verify_service.py T5.
# ---------------------------------------------------------------------------


@app.exception_handler(SentimentServiceError)
async def sentiment_error_handler(_: Request, exc: SentimentServiceError):
    return JSONResponse(
        status_code=exc.http_status,
        content=exc.to_dict(include_detail=INCLUDE_ERROR_DETAIL),
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    """Liveness + the identity of the loaded artifact. Cheap; safe to poll."""
    try:
        clf = get_classifier()
    except SentimentServiceError as exc:
        return JSONResponse(
            status_code=exc.http_status,
            content={"status": "unavailable", **exc.to_dict()},
        )
    return {
        "status": "ok",
        **clf.info(),
        "checkpoint_sha256_matches_pin": (
            clf.checkpoint_sha256 == contract.CHECKPOINT_SHA256
        ),
        "torch_num_threads": torch.get_num_threads(),
        "torch_num_interop_threads": torch.get_num_interop_threads(),
        "service_version": contract.SERVICE_VERSION,
        "response_probabilities_rounded": False,
    }


# ---------------------------------------------------------------------------
# GET /contract  — every value below is sourced from contract.py / errors.py
# ---------------------------------------------------------------------------


@app.get("/contract")
async def get_contract():
    return {
        "model_version": contract.MODEL_VERSION,
        "service_version": contract.SERVICE_VERSION,
        "label_space": "mood3",
        "label_order": list(contract.LABEL_ORDER),
        "deployed_evidence_keys": list(contract.DEPLOYED_EVIDENCE_KEYS),
        "input": {
            "endpoint": "POST /predict",
            "encoding": "application/json",
            "field": "text",
            "type": "string",
            "text_normalisation": contract.TEXT_NORMALISATION,
            "max_length_tokens": contract.MAX_LENGTH,
            "truncation": contract.TRUNCATION,
        },
        "output": {
            "probabilities": (
                "3 softmax probabilities keyed by label_order; unrounded "
                "float; sums to approximately 1.0"
            ),
            "evidence": "the same 3 values keyed by deployed_evidence_keys",
            "predicted_label": "argmax over label_order",
            "predicted_label_id": "index of predicted_label in label_order",
            "confidence": "probability of predicted_label",
            "rounding": "none - full float precision is serialised",
        },
        "prediction_rule": contract.PREDICTION_RULE,
        "device": contract.DEVICE,
        "dtype": contract.DTYPE,
        "supported_language": contract.SUPPORTED_LANGUAGE,
        "english_in_scope": contract.ENGLISH_IN_SCOPE,
        "checkpoint": {
            "name": contract.CHECKPOINT_NAME,
            "sha256": contract.CHECKPOINT_SHA256,
            "architecture": contract.ARCHITECTURE,
            "base_model_id": contract.BASE_MODEL_ID,
            "base_model_revision": contract.BASE_MODEL_REVISION,
        },
        "provenance": contract.PROVENANCE,
        "measured_performance": contract.MEASURED_PERFORMANCE,
        "limitations": list(contract.KNOWN_LIMITATIONS),
        "out_of_scope": list(contract.OUT_OF_SCOPE),
        "error_codes": sorted(errors.ALL_ERROR_CODES),
    }


# ---------------------------------------------------------------------------
# POST /predict  — JSON {"text": "..."}
# ---------------------------------------------------------------------------


@app.post("/predict")
async def predict(body: dict | None = Body(default=None)):
    """Primary inference endpoint.

    The request body is passed to the certified `predict()` UNCHANGED. Type and
    emptiness validation is done by `preprocessing.check_text` (invoked inside
    `predict`), which raises the typed `MissingTextError` / `EmptyTextError`.
    No normalisation, no language gate, no rounding is applied here.
    """
    if not isinstance(body, dict):
        raise MissingTextError(detail="request body must be a JSON object")
    text = body.get("text")
    return get_classifier().predict(text)


if __name__ == "__main__":  # pragma: no cover - manual local run only
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
