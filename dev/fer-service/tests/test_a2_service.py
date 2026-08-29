"""A2 — local service verification test matrix (T1-T9).

Run once. A failing test is the deliverable; do NOT edit an assertion to make it
pass. See docs/plan/FER_A2_LOCAL_SERVICE_VERIFICATION_PLAN.md.

    conda activate maternalink-fer-service
    cd dev/fer-service
    python -m pytest tests/test_a2_service.py -v
"""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from conftest import (
    RESULTS,
    SERVICE_ROOT,
    encode,
    record,
    val_image_paths,
)
from fer_service import contract
from fer_service.preprocessing import preprocess

DOC_RESPONSE_FIELDS = {
    "model_version",
    "model_sha256",
    "class_order",
    "probabilities",
    "predicted_class",
    "confidence",
    "calibrated",
    "label_space",
}
EXPECTED_SHA = "47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c"
CLASS_ORDER = list(contract.CLASS_ORDER)

_PATH_MARKERS = ("/home/", "\\", "site-packages", ".tflite", "miniconda", "/mnt/")


def _no_path_leak(blob: str) -> list[str]:
    return [m for m in _PATH_MARKERS if m in blob]


def _probs_vec(body: dict) -> np.ndarray:
    return np.array([body["probabilities"][c] for c in CLASS_ORDER], dtype=np.float64)


def post_image(client, data: bytes, filename="face.jpg", ctype="image/jpeg"):
    return client.post("/predict", files={"image": (filename, data, ctype)})


# ---------------------------------------------------------------------------
# T1 — service starts, both route families mount, error handler survives
# ---------------------------------------------------------------------------

def test_t1_routes_and_handler(client):
    reach = {}
    reach["/health"] = client.get("/health").status_code
    reach["/contract"] = client.get("/contract").status_code
    reach["/"] = client.get("/").status_code
    # /predict reachable + the FERServiceError handler still formats the envelope
    r = client.post("/predict")
    reach["/predict(no-body)"] = r.status_code
    handler_ok = (
        r.status_code == 400
        and r.headers.get("content-type", "").startswith("application/json")
        and r.json().get("error", {}).get("code") == "missing_image"
    )
    evidence = {"status_codes": reach, "error_handler_formats_envelope": handler_ok,
                "raw_predict_body": r.json()}
    ok = (
        reach["/health"] == 200
        and reach["/contract"] == 200
        and reach["/"] == 200
        and handler_ok
    )
    record("T1", "PASS" if ok else "FAIL", evidence)
    assert reach["/health"] == 200
    assert reach["/contract"] == 200
    assert reach["/"] == 200
    assert handler_ok, "FERServiceError handler did not survive the Gradio mount"


# ---------------------------------------------------------------------------
# T2 — GET /health
# ---------------------------------------------------------------------------

def test_t2_health(client):
    r = client.get("/health")
    body = r.json()
    leaks = _no_path_leak(r.text)
    training_meta = [k for k in ("provenance", "training_run", "training_dataset",
                                 "total_parameters", "keras", "temperature",
                                 "measured_performance", "model_path", "model_dir")
                     if k in r.text.lower()]
    checks = {
        "status_ok": body.get("status") == "ok",
        "model_sha256": body.get("model_sha256") == EXPECTED_SHA,
        "label_space": body.get("label_space") == "fer7",
        "class_order_in_order": body.get("class_order") == CLASS_ORDER,
        "performs_mood_mapping_false": body.get("performs_mood_mapping") is False,
        "performs_face_detection_false": body.get("performs_face_detection") is False,
        "no_path_leak": leaks == [],
        "no_training_metadata": training_meta == [],
    }
    record("T2", "PASS" if all(checks.values()) else "FAIL",
           {"checks": checks, "path_markers_found": leaks,
            "training_meta_found": training_meta, "body": body})
    assert all(checks.values()), checks


# ---------------------------------------------------------------------------
# T3 — GET /contract
# ---------------------------------------------------------------------------

def test_t3_contract(client):
    r = client.get("/contract")
    body = r.json()
    leaks = _no_path_leak(r.text)
    checks = {
        "model_version": body.get("model_version") == contract.MODEL_VERSION,
        "label_space": body.get("label_space") == "fer7",
        "class_order_in_order": body.get("class_order") == CLASS_ORDER,
        "input_endpoint": body.get("input", {}).get("endpoint") == "POST /predict",
        "input_field_image": body.get("input", {}).get("field") == "image",
        "accepted_formats": sorted(body.get("input", {}).get("accepted_formats", []))
        == sorted(contract.ACCEPTED_FORMATS),
        "max_bytes": body.get("input", {}).get("max_bytes") == contract.MAX_UPLOAD_BYTES,
        "calibration_temperature": abs(
            body.get("calibration", {}).get("temperature", 0) - contract.TEMPERATURE
        ) < 1e-9,
        "calibration_baked": body.get("calibration", {}).get("baked_into_graph") is True,
        "limitations_nonempty": len(body.get("limitations", [])) > 0,
        "out_of_scope_nonempty": len(body.get("out_of_scope", [])) > 0,
        "no_path_leak": leaks == [],
    }
    record("T3", "PASS" if all(checks.values()) else "FAIL",
           {"checks": checks, "path_markers_found": leaks, "body": body})
    assert all(checks.values()), checks


# ---------------------------------------------------------------------------
# T4 — POST /predict happy path
# ---------------------------------------------------------------------------

def test_t4_predict_happy_path(client):
    path = val_image_paths(1)[0]
    r = post_image(client, path.read_bytes(), filename=path.name)
    body = r.json()
    vec = _probs_vec(body)
    top = int(np.argmax(vec))
    checks = {
        "http_200": r.status_code == 200,
        "seven_probs": len(body["probabilities"]) == 7,
        "sum_to_one": abs(vec.sum() - 1.0) < 1e-3,
        "predicted_is_argmax": body["predicted_class"] == CLASS_ORDER[top],
        "confidence_matches": abs(body["confidence"] - vec[top]) < 1e-9,
        "calibrated_true": body["calibrated"] is True,
        "label_space_fer7": body["label_space"] == "fer7",
        "all_doc_fields_present": DOC_RESPONSE_FIELDS <= set(body),
        "no_undocumented_fields": set(body) <= DOC_RESPONSE_FIELDS,
    }
    record("T4", "PASS" if all(checks.values()) else "FAIL",
           {"checks": checks, "image": path.name, "undocumented_fields":
            sorted(set(body) - DOC_RESPONSE_FIELDS), "body": body})
    assert all(checks.values()), checks


# ---------------------------------------------------------------------------
# T5 — HTTP <-> in-process consistency  (THE CORE TEST)
# ---------------------------------------------------------------------------

def test_t5_http_inprocess_consistency(client, clf):
    paths = val_image_paths(100)
    max_dev = 0.0
    sum_dev = 0.0
    n_prob = 0
    argmax_agree = 0
    rows = []
    for p in paths:
        raw = p.read_bytes()
        http = _probs_vec(post_image(client, raw, filename=p.name).json())
        with Image.open(io.BytesIO(raw)) as im:
            inproc = clf.predict_array(preprocess(im)).astype(np.float64)
        dev = np.abs(http - inproc)
        max_dev = max(max_dev, float(dev.max()))
        sum_dev += float(dev.sum())
        n_prob += dev.size
        a_http, a_in = int(np.argmax(http)), int(np.argmax(inproc))
        agree = int(a_http == a_in)
        argmax_agree += agree
        rows.append({"basename": p.name, "max_abs_prob_deviation": float(dev.max()),
                     "argmax_http": a_http, "argmax_inprocess": a_in,
                     "argmax_agree": agree})
    RESULTS["consistency"] = rows
    stats = {
        "n": len(paths),
        "max_deviation": max_dev,
        "mean_deviation": sum_dev / n_prob,
        "argmax_agreement": argmax_agree,
        "tolerance": 5e-7,
    }
    RESULTS["t5"] = stats
    ok = max_dev <= 5e-7 and argmax_agree == len(paths)
    record("T5", "PASS" if ok else "FAIL", stats)
    assert argmax_agree == len(paths), f"argmax disagreed on {len(paths)-argmax_agree}/{len(paths)}"
    assert max_dev <= 5e-7, f"max deviation {max_dev:.3e} > 5e-7"


# ---------------------------------------------------------------------------
# T6 — every documented error path
# ---------------------------------------------------------------------------

def _err_case(client, trigger, expected_code, expected_status, **post_kw):
    if trigger == "missing_image":
        r = client.post("/predict")
    else:
        r = client.post("/predict", **post_kw)
    body = r.json()
    err = body.get("error", {})
    match = err.get("code") == expected_code and r.status_code == expected_status
    RESULTS["error_matrix"].append({
        "trigger": trigger, "expected_code": expected_code,
        "actual_code": err.get("code"), "expected_status": expected_status,
        "actual_status": r.status_code, "match": match,
    })
    envelope_ok = set(body) == {"error"} and set(err) == {"code", "message"}
    leaks = _no_path_leak(r.text)
    return match, envelope_ok, leaks, body


def test_t6_error_paths(client):
    # a JPEG that Image.open() identifies but load() cannot finish
    big = Image.effect_noise((512, 512), 80).convert("RGB")
    good_jpeg = encode(big, "JPEG")
    truncated_jpeg = good_jpeg[: int(len(good_jpeg) * 0.55)]

    cases = [
        ("missing_image", "missing_image", 400, {}),
        ("gif", "unsupported_format", 415,
         dict(files={"image": ("x.gif", encode(Image.new("L", (32, 32)), "GIF"), "image/gif")})),
        ("random_bytes", "unsupported_format", 415,
         dict(files={"image": ("x.bin", os.urandom(4096), "application/octet-stream")})),
        ("truncated_jpeg", "invalid_image", 400,
         dict(files={"image": ("t.jpg", truncated_jpeg, "image/jpeg")})),
        ("over_8mb", "image_too_large", 413,
         dict(files={"image": ("big.jpg", b"\x00" * (8 * 1024 * 1024 + 1), "image/jpeg")})),
        ("8x8", "image_too_small", 400,
         dict(files={"image": ("s.png", encode(Image.new("L", (8, 8)), "PNG"), "image/png")})),
    ]
    detail = {}
    all_ok = True
    for trigger, code, status, kw in cases:
        match, envelope_ok, leaks, body = _err_case(client, trigger, code, status, **kw)
        detail[trigger] = {"match": match, "envelope_ok": envelope_ok,
                           "path_leak": leaks, "body": body}
        all_ok &= match and envelope_ok and not leaks

    untested = ["model_load_failed", "inference_failed", "preprocessing_failed",
               "contract_violation"]
    record("T6", "PASS" if all_ok else "FAIL",
           {"cases": detail, "untested_at_runtime": untested,
            "untested_reason": "cannot trigger without breaking the install; "
            "verified by code inspection in errors.py / inference.py / preprocessing.py"})
    for trigger, code, status, kw in cases:
        row = next(r for r in RESULTS["error_matrix"] if r["trigger"] == trigger)
        assert row["match"], f"{trigger}: got {row['actual_code']}/{row['actual_status']}, expected {code}/{status}"
        assert detail[trigger]["envelope_ok"], f"{trigger}: bad error envelope {detail[trigger]['body']}"
        assert not detail[trigger]["path_leak"], f"{trigger}: path leak {detail[trigger]['path_leak']}"


# ---------------------------------------------------------------------------
# T7 — full uncropped frame (documentation, not pass/fail)
# ---------------------------------------------------------------------------

def test_t7_full_frame(client):
    crop_path = val_image_paths(1)[0]
    with Image.open(crop_path) as c:
        face = c.convert("L").copy()
    canvas = Image.new("L", (480, 640), color=110)
    canvas.paste(face, (200, 300))          # small 48x48 face in a large frame
    r = post_image(client, encode(canvas.convert("RGB"), "JPEG"), filename="frame.jpg")
    body = r.json()
    obs = {
        "status_code": r.status_code,
        "response_fields": sorted(body),
        "has_any_warning_field": bool(set(body) - DOC_RESPONSE_FIELDS),
        "probabilities": body.get("probabilities"),
        "predicted_class": body.get("predicted_class"),
        "confidence": body.get("confidence"),
        "note": "Full frame accepted silently; response is structurally identical to "
                "a real crop. Nothing signals that the probabilities are meaningless.",
    }
    RESULTS["t7"] = obs
    record("T7", "OBSERVED", obs)
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# T8 — no image retention
# ---------------------------------------------------------------------------

def _snapshot(dirs):
    seen = set()
    for d in dirs:
        d = Path(d)
        if not d.is_dir():
            continue
        for root, _, files in os.walk(d):
            for f in files:
                seen.add(str(Path(root) / f))
    return seen


def test_t8_no_retention(client):
    tmp = Path(tempfile.gettempdir())
    watched = [SERVICE_ROOT, tmp]
    before = _snapshot(watched)
    paths = val_image_paths(20)
    for p in paths:
        post_image(client, p.read_bytes(), filename=p.name)
    after = _snapshot(watched)
    new_files = sorted(after - before)
    img_ext = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif", ".tif", ".tiff")
    new_images = [f for f in new_files if f.lower().endswith(img_ext)]
    record("T8", "PASS" if not new_images else "FAIL",
           {"requests": len(paths), "new_files_any": new_files,
            "new_image_files": new_images, "watched": [str(w) for w in watched]})
    assert not new_images, f"image files appeared after requests: {new_images}"


# ---------------------------------------------------------------------------
# T9 — Gradio UI (non-blocking)
# ---------------------------------------------------------------------------

def test_t9_gradio_ui(client):
    r = client.get("/")
    text = r.text.lower()
    ok = r.status_code == 200 and ("gradio" in text or "<script" in text)
    record("T9", "PASS" if ok else "FAIL",
           {"status_code": r.status_code, "looks_like_gradio": ok,
            "content_length": len(r.text)})
    assert r.status_code == 200
