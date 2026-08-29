"""Hugging Face Space entrypoint for the MaternaLink FER inference service.

Serves two things from one process:

  * ``POST /predict``  - a plain REST endpoint for the backend. Multipart upload,
                         JSON response. This is the stable contract.
  * ``/``              - a Gradio UI for demonstration and manual inspection.

The REST route is mounted on the FastAPI app that Gradio runs on, so the backend
never has to deal with Gradio's two-step event API.

Outputs SEVEN FER classes. It does NOT produce CALM / NEUTRAL / DISTRESSED — that
mapping is a separate, undecided application-level decision.
"""

from __future__ import annotations

import os

import gradio as gr
import uvicorn
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse

from fer_service import contract
from fer_service.errors import FERServiceError, MissingImageError
from fer_service.inference import load_default

# Expose stack traces only when explicitly enabled for local debugging.
INCLUDE_ERROR_DETAIL = os.environ.get("FER_DEBUG", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title="MaternaLink FER Inference Service",
    version=contract.SERVICE_VERSION,
    description=(
        "Seven-class calibrated facial expression recognition. "
        "Not a diagnostic tool."
    ),
)

_classifier = None


def get_classifier():
    """Lazy load. Keeps the Space responsive during cold start."""
    global _classifier
    if _classifier is None:
        _classifier = load_default()
    return _classifier


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


@app.exception_handler(FERServiceError)
async def fer_error_handler(_: Request, exc: FERServiceError):
    return JSONResponse(
        status_code=exc.http_status,
        content=exc.to_dict(include_detail=INCLUDE_ERROR_DETAIL),
    )


# ---------------------------------------------------------------------------
# REST API — the backend contract
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    """Liveness + the identity of the loaded artifact. Cheap; safe to poll."""
    try:
        return {"status": "ok", **get_classifier().info()}
    except FERServiceError as exc:
        return JSONResponse(
            status_code=exc.http_status,
            content={"status": "unavailable", **exc.to_dict()},
        )


@app.get("/contract")
async def get_contract():
    """The full input/output contract, served from the model's own constants.

    Lets the backend verify at startup that it is talking to the version it was
    written against, rather than trusting documentation to be current.
    """
    return {
        "model_version": contract.MODEL_VERSION,
        "service_version": contract.SERVICE_VERSION,
        "label_space": "fer7",
        "class_order": list(contract.CLASS_ORDER),
        "input": {
            "endpoint": "POST /predict",
            "encoding": "multipart/form-data",
            "field": "image",
            "accepted_formats": list(contract.ACCEPTED_FORMATS),
            "max_bytes": contract.MAX_UPLOAD_BYTES,
            "expects": "a cropped face region; this service does NOT detect faces",
        },
        "output": {
            "probabilities": "7 calibrated softmax probabilities, sums to 1.0",
            "predicted_class": "argmax over class_order",
            "confidence": "probability of predicted_class",
        },
        "calibration": contract.CALIBRATION,
        "limitations": list(contract.KNOWN_LIMITATIONS),
        "out_of_scope": list(contract.OUT_OF_SCOPE),
    }


@app.post("/predict")
async def predict(image: UploadFile | None = File(default=None)):
    """Primary inference endpoint. Multipart upload, field name ``image``."""
    if image is None:
        raise MissingImageError()
    data = await image.read()
    return get_classifier().predict(data)


# ---------------------------------------------------------------------------
# Gradio UI — demonstration only. Not the backend integration path.
# ---------------------------------------------------------------------------


def _ui_predict(img):
    if img is None:
        return {}, "No image supplied.", ""
    try:
        result = get_classifier().predict_pil(img)
    except FERServiceError as exc:
        return {}, f"{exc.code}: {exc.message}", ""
    summary = (
        f"{result['predicted_class']}  (confidence {result['confidence']:.3f})"
    )
    return result["probabilities"], summary, result["model_version"]


_DESCRIPTION = """
Seven-class facial expression recognition for the **MaternaLink** project
(IT22638168). Upload a **cropped face image**; this service does not detect faces.

Probabilities are **temperature-calibrated** (T = 5.727, ECE 0.0126).

**This is not a diagnostic tool.** It estimates facial expression, not emotion,
mood, or any mental-health state. It does not output the application's
CALM / NEUTRAL / DISTRESSED states — that mapping is a separate downstream
decision and is deliberately not implemented here.

Held-out test performance: macro-F1 **0.6036**, accuracy **0.6289** (FER-2013
PrivateTest). Trained on a predominantly Western dataset; external validity for
Sri Lankan users is unvalidated.
"""

demo = gr.Interface(
    fn=_ui_predict,
    inputs=gr.Image(type="pil", label="Cropped face image"),
    outputs=[
        gr.Label(num_top_classes=7, label="Calibrated probabilities"),
        gr.Textbox(label="Prediction"),
        gr.Textbox(label="Model version"),
    ],
    title="MaternaLink FER — 7-class calibrated expression recognition",
    description=_DESCRIPTION,
    allow_flagging="never",
    api_name="predict_ui",
)

app = gr.mount_gradio_app(app, demo, path="/")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 7860)))
