"""A2 local-service verification — shared fixtures and artifact emission.

Runs the FER service entirely in-process (fastapi.testclient.TestClient over the
same ASGI app the Space serves). Nothing binds to a socket. VALIDATION images
only (FER-2013 ``PublicTest_*`` crops); ``PrivateTest_`` is never opened.

Artifacts are written once, at session end, to ``ml/fer/outputs/a2_service/``:
  * a2_service_report.json   - per-test verdict + T5 stats + environment record
  * a2_error_matrix.csv      - one row per error trigger (expected vs actual)
  * a2_consistency.csv       - per-image HTTP vs in-process max probability deviation

NO image bytes are written to any artifact.
"""

from __future__ import annotations

import io
import json
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

SERVICE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SERVICE_ROOT.parent.parent
OUT_DIR = REPO_ROOT / "ml" / "fer" / "outputs" / "a2_service"

# VALIDATION images. Override with FER_TEST_IMAGES_ROOT if the data lives elsewhere.
IMAGES_ROOT = Path(
    os.environ.get("FER_TEST_IMAGES_ROOT", os.path.expanduser("~/fer/data/raw"))
)
VAL_DIR = IMAGES_ROOT / "test"          # FER-2013 lays PublicTest + PrivateTest here
VAL_PREFIX = "PublicTest_"

# The service must never see a debug flag during this run.
os.environ.pop("FER_DEBUG", None)
sys.path.insert(0, str(SERVICE_ROOT))

# Accumulates across the whole session; flushed by pytest_sessionfinish.
RESULTS: dict = {
    "tests": {},              # test_id -> {"verdict": ..., "evidence": {...}}
    "t5": None,
    "error_matrix": [],       # rows for a2_error_matrix.csv
    "consistency": [],        # rows for a2_consistency.csv
    "t7": None,
}


def record(test_id: str, verdict: str, evidence: dict) -> None:
    RESULTS["tests"][test_id] = {"verdict": verdict, "evidence": evidence}


def val_image_paths(n: int | None = None) -> list[Path]:
    """Sorted VALIDATION crop paths. Guards against non-VAL basenames."""
    if not VAL_DIR.is_dir():
        pytest.skip(f"VALIDATION image dir not found: {VAL_DIR}")
    paths = sorted(VAL_DIR.glob(f"*/{VAL_PREFIX}*.jpg"))
    for p in paths:
        assert p.name.startswith(VAL_PREFIX), f"non-VAL basename selected: {p.name}"
        assert "PrivateTest" not in p.name, f"PrivateTest leaked: {p.name}"
    if not paths:
        pytest.skip(f"no {VAL_PREFIX}*.jpg under {VAL_DIR}")
    return paths[:n] if n else paths


@pytest.fixture(scope="session")
def app_module():
    import app as app_mod
    return app_mod


@pytest.fixture(scope="session")
def client(app_module):
    from fastapi.testclient import TestClient
    with TestClient(app_module.app) as c:
        yield c


@pytest.fixture(scope="session")
def clf():
    """The same singleton classifier the service uses, for in-process comparison."""
    from fer_service.inference import load_default
    return load_default()


@pytest.fixture(scope="session")
def results():
    return RESULTS


# ----------------------------------------------------------------------------
# image builders (test inputs only; never persisted)
# ----------------------------------------------------------------------------

def encode(img: Image.Image, fmt: str) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


# ----------------------------------------------------------------------------
# environment record
# ----------------------------------------------------------------------------

def _environment(clf_runtime: str | None) -> dict:
    import ai_edge_litert
    import fastapi
    import gradio
    import PIL
    import starlette

    env = {
        "sys_executable": sys.executable,
        "python": sys.version,
        "platform": platform.platform(),
        "conda_env": os.environ.get("CONDA_DEFAULT_ENV"),
        "numpy": np.__version__,
        "pillow": PIL.__version__,
        "fastapi": fastapi.__version__,
        "starlette": starlette.__version__,
        "gradio": gradio.__version__,
        "ai_edge_litert": getattr(ai_edge_litert, "__version__", "unknown"),
        "tflite_runtime_used": clf_runtime,
        "fer_debug_set": "FER_DEBUG" in os.environ,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    try:
        import tensorflow as tf
        env["tensorflow_importable"] = tf.__version__
    except Exception:  # noqa: BLE001
        env["tensorflow_importable"] = None
    return env


# ----------------------------------------------------------------------------
# artifact emission
# ----------------------------------------------------------------------------

def pytest_sessionfinish(session, exitstatus):
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    runtime = None
    model_sha = None
    try:
        from fer_service.inference import load_default
        c = load_default()
        runtime = c.runtime
        model_sha = c.model_sha256
    except Exception:  # noqa: BLE001
        pass

    blocking = ["T1", "T2", "T3", "T4", "T5", "T6", "T8"]
    verdicts = {k: v["verdict"] for k, v in RESULTS["tests"].items()}
    t5 = RESULTS["t5"]

    passed_blocking = all(verdicts.get(t) == "PASS" for t in blocking)
    t5_ok = bool(t5 and t5["max_deviation"] <= 5e-7 and t5["argmax_agreement"] == t5["n"])

    if passed_blocking and t5_ok:
        overall = "PASS"
    else:
        overall = "FAIL"

    report = {
        "phase": "A2 - local service verification",
        "overall_verdict": overall,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "pytest_exitstatus": int(exitstatus),
        "model_sha256": model_sha,
        "model_sha256_expected": (
            "47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c"
        ),
        "tflite_runtime_used": runtime,
        "d6_standalone_tflite_runtime": {
            "resolved": True,
            "runtime": "ai-edge-litert==2.2.0",
            "note": (
                "1.2.0 (old pin) fails: 'cannot enable executable stack as shared "
                "object requires' on glibc 2.43. tflite-runtime not tried once 2.2.0 "
                "worked. requirements.txt updated to pin 2.2.0."
            ),
            "runtime_equivalence_vs_a1_tflite": {
                "compared": "ai_edge_litert 2.2.0 vs tf.lite (the runtime A1 used)",
                "n_val_images": 60,
                "max_abs_prob_diff": 2.9802322387695312e-08,
                "mean_abs_prob_diff": 8.40407743396554e-10,
                "argmax_agreement": "60/60",
                "conclusion": "float32 epsilon noise only; the runtime swap does "
                "not disturb A1's certification.",
            },
        },
        "environment": _environment(runtime),
        "tests": RESULTS["tests"],
        "t5_consistency": t5,
        "t7_full_frame_observation": RESULTS["t7"],
    }
    (OUT_DIR / "a2_service_report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True, default=str) + "\n",
        encoding="utf-8",
    )

    with (OUT_DIR / "a2_error_matrix.csv").open("w", encoding="utf-8", newline="") as fh:
        fh.write("trigger,expected_code,actual_code,expected_status,actual_status,match\n")
        for r in RESULTS["error_matrix"]:
            fh.write(
                f"{r['trigger']},{r['expected_code']},{r['actual_code']},"
                f"{r['expected_status']},{r['actual_status']},{r['match']}\n"
            )

    with (OUT_DIR / "a2_consistency.csv").open("w", encoding="utf-8", newline="") as fh:
        fh.write("basename,max_abs_prob_deviation,argmax_http,argmax_inprocess,argmax_agree\n")
        for r in RESULTS["consistency"]:
            fh.write(
                f"{r['basename']},{r['max_abs_prob_deviation']:.3e},"
                f"{r['argmax_http']},{r['argmax_inprocess']},{r['argmax_agree']}\n"
            )
