"""FER A1 — preprocessing parity verifier. RUN BEFORE DEPLOYING. Never run by an agent.

Why this exists
---------------
The service decodes and resizes with Pillow; notebooks 04-07 decoded and resized
with TensorFlow. Every published FER metric (test macro-F1 0.6036, accuracy 0.6289)
came from the TensorFlow pipeline. The claim that this service reproduces those
metrics is an ASSUMPTION until this script measures it.

Notebook 07 pinned ``dct_method='INTEGER_ACCURATE'`` precisely because it is
bit-exact with Pillow's JPEG decoder, so DECODING is equivalent by construction
(still measured here — an inherited claim is not a verified one). RESIZING is not
covered by that guarantee: ``PIL.Image.resize(BILINEAR)`` and
``tf.image.resize(method='bilinear')`` are *not* the same operator. They differ in
output dtype handling (PIL rounds to uint8, TF keeps float32) and in antialiasing on
downscale. Measuring that difference is the entire point of A1.

Two independent checks (architecture preserved from the original script)
-----------------------------------------------------------------------
CHECK 1 — preprocessing parity, model held constant.
    Build the input tensor twice for the same image (service Pillow path vs the
    verbatim notebook-07 TensorFlow path), feed BOTH through the SAME TFLite model.
    Any difference is attributable purely to preprocessing.

CHECK 2 — argmax agreement against notebook 04's recorded VAL predictions.
    ``nb04_val_probabilities.csv`` is PRE-calibration uncalibrated Keras output; the
    service is calibrated TFLite. Only the ARGMAX is comparable (calibration is
    argmax-invariant — nb07 measured zero argmax changes). Probability VALUES are
    NEVER compared here. This script also REFUSES to load
    ``nb05_test_probabilities_*.csv`` under any flag.

TEST / PrivateTest_ SPLIT IS NEVER TOUCHED. Five independent guards (plan §11).

A1-CORE is the blocking gate. A1-EXT (``--upscale-source``) is a non-blocking
diagnostic that cannot pass or fail — there is no ground truth for a 96x96 source
because the model was never fed one during training.

Usage (WSL, conda ``maternalink-fer-gpu``, from ``dev/fer-service``)::

    python tools/verify_parity.py \\
        --images-root ~/fer/data/raw \\
        --manifest    ../../ml/fer/outputs/splits_cleaned.csv \\
        --reference   ../../ml/fer/outputs/nb04_val_probabilities.csv \\
        --model       models/fer_mobilenetv2_96_float32.tflite \\
        --out-dir     ../../ml/fer/outputs/a1_parity \\
        --limit 0

Exit codes:  0 = PASS or PASS WITH INVESTIGATION · 1 = FAIL (hard gate exceeded,
guard tripped, hash mismatch, image failed) · 2 = COULD NOT RUN (missing data,
TensorFlow absent, manifest wrong). Exit 2 is NOT a pass.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import platform
import sys
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from fer_service import contract  # noqa: E402
from fer_service.errors import (  # noqa: E402
    ContractViolationError,
    FERServiceError,
)
from fer_service.inference import FERClassifier, sha256_file  # noqa: E402
from fer_service.preprocessing import preprocess  # noqa: E402

# tools/ -> fer-service -> dev -> IT22638168
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
DEFAULT_OUT_DIR = os.path.join(REPO_ROOT, "ml", "fer", "outputs", "a1_parity")
NOTEBOOK_07 = os.path.join(
    REPO_ROOT, "ml", "fer", "notebooks", "07_tflite_conversion.ipynb"
)

VAL_PREFIX = "PublicTest_"
EXPECTED_VAL_COUNT = 3589

# Guard: no code path may open anything matching these tokens (plan §11).
DENYLIST_SUBSTRINGS = (
    "privatetest",
    "pregnancy_frozen_test_set.csv",
    "nb05_test_probabilities",
)

# Predicted divergence bound, stated BEFORE the run (plan §4.2): TF resizes float32
# and keeps fractional values; PIL resizes uint8 and rounds every interpolated pixel
# to an integer grey level -> <= 0.5 grey levels = 0.5 / 127.5 in [-1, 1] space.
PREDICTED_UINT8_BOUND = 0.5 / 127.5  # 0.00392...

# -------------------------------------------------------------------------
# Two-tier tolerances (plan §8). Recorded verbatim into the summary JSON as
# "tolerances_as_applied". A threshold moved to make a run pass invalidates the
# gate — see plan §10.
# -------------------------------------------------------------------------
TOLERANCES = {
    "comparison1_tensor": {
        "max_abs_diff": {"expected_band": 0.0040, "hard_gate": 0.020},
        "mean_abs_diff": {"expected_band": 0.0020, "hard_gate": 0.010},
        "p99_abs_diff": {"expected_band": 0.0040, "hard_gate": 0.020},
        "frac_elems_gt_0.01": {"expected_band": 0.0001, "hard_gate": 0.010},
    },
    "comparison2_probability": {
        "max_abs_diff": {"expected_band": 0.010, "hard_gate": 0.020},
        "mean_abs_diff": {"expected_band": 0.002, "hard_gate": 0.010},
        "argmax_agreement": {"expected_band": 0.995, "hard_gate": 0.990},
    },
    "comparison3_vs_nb04": {
        "argmax_agreement": {"expected_band": 0.98, "hard_gate": 0.97},
    },
    "per_step_expected_max_abs_diff": {
        "after_decode_grayscale_48_uint8": 1e-6,
        "after_step2_resize48_uint8": 1e-6,
        "after_step3_replicate_48x3": 1e-6,
        "after_step4_resize96": 0.75,
        "after_step5_scaling_pm1": 0.0040,
    },
}

PER_STEP_KEYS = list(TOLERANCES["per_step_expected_max_abs_diff"])


class CouldNotRun(Exception):
    """Structural problem -> exit 2. NOT a pass."""


class GuardTripped(Exception):
    """A TEST-split / denylist guard fired -> exit 1 (FAIL)."""


# -------------------------------------------------------------------------
# Guards
# -------------------------------------------------------------------------

def _check_denylist(path: str) -> None:
    low = str(path).lower()
    for token in DENYLIST_SUBSTRINGS:
        if token in low:
            raise GuardTripped(f"denylisted token {token!r} in path {path!r}")


def _assert_open_allowed(basename: str, path: str) -> None:
    """Open-time assertion (plan §11 guard 3). Fail hard; never skip-and-continue."""
    if "PrivateTest_" in basename:
        raise GuardTripped(f"PrivateTest_ basename reached an open call: {basename!r}")
    if not basename.startswith(VAL_PREFIX):
        raise GuardTripped(f"non-VAL basename reached an open call: {basename!r}")
    _check_denylist(path)


# -------------------------------------------------------------------------
# TensorFlow reference pipeline
# -------------------------------------------------------------------------

def _decode_and_preprocess(path):
    """VERBATIM transcription of ``ml/fer/notebooks/07_tflite_conversion.ipynb``
    cell 10 (``_decode_and_preprocess``) — the function that produced the TFLite
    comparison, calibration and parity numbers.

    DO NOT re-derive this from ``nb07_tensor_spec.json`` prose. DO NOT "improve" it.
    The cast to float32 happens BEFORE ``grayscale_to_rgb``, and the 96x96 resize
    runs on the float32 tensor. That ordering is authoritative.
    """
    import tensorflow as tf

    raw = tf.io.read_file(path)
    img = tf.io.decode_jpeg(raw, channels=1, dct_method="INTEGER_ACCURATE")
    img = tf.image.resize(img, (48, 48), method="bilinear")
    img = tf.cast(tf.round(img), tf.uint8)          # (48,48,1) uint8
    x = tf.cast(img, tf.float32)                    # <-- float32 BEFORE grayscale_to_rgb
    x = tf.image.grayscale_to_rgb(x)                # (48,48,3) float32
    x = tf.image.resize(x, (96, 96), method="bilinear")
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    return x


def _tf_stages(decoded_uint8):
    """Per-step taps that mirror ``_decode_and_preprocess`` op-for-op (plan §6).

    ``decoded_uint8`` is the (H,W,1) uint8 tensor straight from ``decode_jpeg``.
    Every op below is byte-identical to the verbatim function; the only additions
    are ``.numpy()`` taps, which do not change the computation. An equivalence
    assertion against the verbatim function runs on the first image.
    """
    import tensorflow as tf

    st = {}
    st["after_decode_grayscale_48_uint8"] = (
        decoded_uint8.numpy()[..., 0].astype(np.float64)
    )
    img = tf.image.resize(decoded_uint8, (48, 48), method="bilinear")
    img = tf.cast(tf.round(img), tf.uint8)
    st["after_step2_resize48_uint8"] = img.numpy()[..., 0].astype(np.float64)
    x = tf.cast(img, tf.float32)
    x = tf.image.grayscale_to_rgb(x)
    st["after_step3_replicate_48x3"] = x.numpy().astype(np.float64)
    x = tf.image.resize(x, (96, 96), method="bilinear")
    st["after_step4_resize96"] = x.numpy().astype(np.float64)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    st["after_step5_scaling_pm1"] = x.numpy().astype(np.float64)
    return st, np.expand_dims(x.numpy(), 0).astype(np.float32)


def _tf_final_from_decoded(decoded_uint8):
    """The verbatim pipeline minus the decode, for A1-EXT (source is an upscaled
    array, not a file). Identical ops to ``_decode_and_preprocess`` from the first
    resize onward."""
    import tensorflow as tf

    img = tf.image.resize(decoded_uint8, (48, 48), method="bilinear")
    img = tf.cast(tf.round(img), tf.uint8)
    x = tf.cast(img, tf.float32)
    x = tf.image.grayscale_to_rgb(x)
    x = tf.image.resize(x, (96, 96), method="bilinear")
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    return np.expand_dims(x.numpy(), 0).astype(np.float32)


# -------------------------------------------------------------------------
# Pillow / service pipeline (mirrors fer_service.preprocessing.preprocess)
# -------------------------------------------------------------------------

def _pil_stages(img):
    """Per-step taps mirroring ``fer_service.preprocessing.preprocess`` exactly.
    The service ``preprocess()`` is still used for the actual tensor comparison;
    this only exposes intermediates. Equivalence is asserted on the first image."""
    from PIL import Image

    st = {}
    gray = img.convert("L")
    st["after_decode_grayscale_48_uint8"] = np.asarray(gray, dtype=np.float64)
    gray48 = gray.resize(
        (contract.NATIVE_SOURCE_SIZE, contract.NATIVE_SOURCE_SIZE), Image.BILINEAR
    )
    arr48 = np.asarray(gray48, dtype=np.uint8)
    st["after_step2_resize48_uint8"] = arr48.astype(np.float64)
    arr48_rgb = np.stack([arr48, arr48, arr48], axis=-1)
    st["after_step3_replicate_48x3"] = arr48_rgb.astype(np.float64)
    # mirrors preprocess() after the A1 float32 fix (2026-08-29): the 48->96 resize
    # runs in float32, matching tf.image.resize, then channels are replicated.
    img48_f = Image.fromarray(arr48.astype(np.float32), mode="F")
    img96_f = img48_f.resize(
        (contract.MODEL_INPUT_SIZE, contract.MODEL_INPUT_SIZE), Image.BILINEAR
    )
    arr96_gray = np.asarray(img96_f, dtype=np.float32)
    arr96 = np.stack([arr96_gray, arr96_gray, arr96_gray], axis=-1)
    st["after_step4_resize96"] = arr96.astype(np.float64)
    x = arr96 / 127.5 - 1.0
    st["after_step5_scaling_pm1"] = x.astype(np.float64)
    return st


# map the per-step tap keys onto the tolerance keys (which are shorter)
_STEP_TAP_TO_TOL = {
    "after_decode_grayscale_48_uint8": "after_decode_grayscale_48_uint8",
    "after_step2_resize48_uint8": "after_step2_resize48_uint8",
    "after_step3_replicate_48x3": "after_step3_replicate_48x3",
    "after_step4_resize96": "after_step4_resize96",
    "after_step5_scaling_pm1": "after_step5_scaling_pm1",
}


# -------------------------------------------------------------------------
# Stats helpers
# -------------------------------------------------------------------------

def _dist_stats(diffs: np.ndarray) -> dict:
    d = np.asarray(diffs, dtype=np.float64)
    return {
        "n": int(d.size),
        "max": float(d.max()),
        "mean": float(d.mean()),
        "median": float(np.median(d)),
        "p95": float(np.percentile(d, 95)),
        "p99": float(np.percentile(d, 99)),
        "count_gt_0.001": int((d > 0.001).sum()),
        "count_gt_0.004": int((d > 0.004).sum()),
        "count_gt_0.01": int((d > 0.01).sum()),
        "count_gt_0.02": int((d > 0.02).sum()),
        "frac_gt_0.01": float((d > 0.01).mean()),
    }


def _verdict(in_band: bool, in_gate: bool) -> str:
    if in_band:
        return "PASS"
    if in_gate:
        return "PASS WITH INVESTIGATION"
    return "FAIL"


# -------------------------------------------------------------------------
# Environment record
# -------------------------------------------------------------------------

def _build_env() -> dict:
    import PIL
    import PIL.features

    env = {
        "sys_executable": sys.executable,
        "python": sys.version,
        "platform": platform.platform(),
        "numpy": np.__version__,
        "pillow": PIL.__version__,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    try:
        env["pillow_jpeg_library_version"] = PIL.features.version("jpg")
    except Exception:  # noqa: BLE001
        env["pillow_jpeg_library_version"] = None
    try:
        env["pillow_libjpeg_turbo"] = bool(
            PIL.features.check_feature("libjpeg_turbo")
        )
    except Exception:  # noqa: BLE001
        env["pillow_libjpeg_turbo"] = None

    try:
        import keras
        import tensorflow as tf

        env["tensorflow"] = tf.__version__
        env["keras"] = keras.__version__
    except ImportError as exc:
        raise CouldNotRun(
            f"TensorFlow is required — CHECK 1 cannot run without it, and a run "
            f"without CHECK 1 is not a valid A1: {exc}"
        )
    return env


# -------------------------------------------------------------------------
# Manifest + reference loading (with guards)
# -------------------------------------------------------------------------

def _load_val_manifest(manifest_path: str, images_root: str):
    import pandas as pd

    man = pd.read_csv(manifest_path)
    for col in ("file_path", "split_group", "class"):
        if col not in man.columns:
            raise CouldNotRun(
                f"manifest lacks column {col!r}; columns: {list(man.columns)}"
            )

    # GUARD 1 — filter to VAL BEFORE building any path lookup. TEST rows never
    # enter the process.
    val = man[man["split_group"] == "VAL"].reset_index(drop=True).copy()
    if len(val) != EXPECTED_VAL_COUNT:
        raise CouldNotRun(
            f"VAL rows = {len(val)}, expected exactly {EXPECTED_VAL_COUNT}"
        )

    val["basename"] = val["file_path"].map(
        lambda p: os.path.basename(str(p).replace("\\", "/"))
    )

    # GUARD 2 — basename allowlist.
    bad = val.loc[~val["basename"].str.startswith(VAL_PREFIX), "basename"].tolist()
    if bad:
        raise GuardTripped(
            f"{len(bad)} VAL basenames do not start with {VAL_PREFIX!r}; "
            f"first: {bad[0]}"
        )
    if val["basename"].str.contains("PrivateTest_").any():
        raise GuardTripped("PrivateTest_ basename present in the VAL filter result")

    # Rebuild every path from images_root + split dir + class + basename. NEVER
    # consume the manifest's stored '../data/raw\\train\\...' relative paths.
    # FER-2013 lays VAL and TEST both under 'test/' on disk; that is why the
    # basename-level guards above (not directory reasoning) are what protect TEST.
    val["abs_path"] = [
        os.path.join(
            images_root, "train" if g == "TRAIN" else "test", str(c), b
        )
        for g, c, b in zip(val["split_group"], val["class"], val["basename"])
    ]
    val = val.rename(columns={"class": "cls"})
    return val


def _load_reference(reference_path: str, val_basenames: set):
    import pandas as pd

    # GUARD 4 — refuse nb05 test probabilities (and anything denylisted) outright.
    _check_denylist(reference_path)

    ref = pd.read_csv(reference_path)
    if "basename" not in ref.columns:
        raise CouldNotRun(
            f"reference lacks 'basename'; columns: {list(ref.columns)}"
        )
    if len(ref) != EXPECTED_VAL_COUNT:
        raise CouldNotRun(
            f"reference has {len(ref)} rows, expected {EXPECTED_VAL_COUNT}"
        )
    ref["basename"] = ref["basename"].astype(str)
    if not ref["basename"].str.startswith(VAL_PREFIX).all():
        raise GuardTripped("reference contains non-PublicTest_ rows")
    if ref["basename"].str.contains("PrivateTest_").any():
        raise GuardTripped("reference contains PrivateTest_ rows")

    prob_cols = ["prob_" + c for c in contract.CLASS_ORDER]
    missing = [c for c in prob_cols if c not in ref.columns]
    if missing:
        raise CouldNotRun(f"reference lacks probability columns: {missing}")

    mat = ref[prob_cols].to_numpy(dtype=np.float64)
    ref_argmax = {
        b: int(np.argmax(row)) for b, row in zip(ref["basename"], mat)
    }
    if set(ref_argmax) != val_basenames:
        raise GuardTripped(
            "VAL manifest basenames and reference basenames do not match exactly"
        )
    return ref_argmax


# -------------------------------------------------------------------------
# A1-CORE
# -------------------------------------------------------------------------

def run_core(args, clf, val, ref_argmax, env, out_dir, hash_ok):
    from PIL import Image

    rows = val
    if args.limit and args.limit > 0:
        rows = rows.iloc[: args.limit].copy()
    n_target = len(rows)

    opened: list[str] = []
    per_image: list[dict] = []
    tensor_chunks: list[np.ndarray] = []
    prob_chunks: list[np.ndarray] = []
    step_max = {k: 0.0 for k in PER_STEP_KEYS}
    n_pt_agree = 0
    n_nb04_agree = 0
    per_class = {}  # cls -> [pil==tf, pil==nb04, total]
    failures: list[str] = []

    for i, r in enumerate(
        rows.itertuples(index=False, name="Row")
    ):
        base = r.basename
        path = r.abs_path
        _assert_open_allowed(base, path)

        if not os.path.isfile(path):
            failures.append(f"missing file: {base}")
            continue

        # ---- service (Pillow) path ----------------------------------------
        with Image.open(path) as im:
            im.load()
            x_pil = preprocess(im)
            pil_st = _pil_stages(im)
        opened.append(base)

        # ---- TF reference path (verbatim, plan §2) -----------------------
        import tensorflow as tf

        decoded = tf.io.decode_jpeg(
            tf.io.read_file(path), channels=1, dct_method="INTEGER_ACCURATE"
        )
        tf_st, x_tf = _tf_stages(decoded)

        if i == 0:
            ref_tensor = (
                np.expand_dims(_decode_and_preprocess(path).numpy(), 0)
                .astype(np.float32)
            )
            if not np.array_equal(ref_tensor, x_tf):
                raise CouldNotRun(
                    "tapped TF stages diverge from the verbatim nb07 function — "
                    "refusing to run on an unfaithful reference"
                )
            if not np.array_equal(
                pil_st["after_step5_scaling_pm1"].astype(np.float32), x_pil[0]
            ):
                raise CouldNotRun(
                    "_pil_stages() diverges from the shipped preprocess() — the "
                    "per-step diagnostic is a stale mirror; refusing to report "
                    "misleading taps"
                )

        # ---- per-step localisation (plan §6) ----------------------------
        for tap, tol_key in _STEP_TAP_TO_TOL.items():
            a, b = pil_st[tap], tf_st[tap]
            if a.shape != b.shape:
                failures.append(
                    f"{base}: stage {tap} shape {a.shape} vs {b.shape}"
                )
                m = float("inf")
            else:
                m = float(np.abs(a - b).max())
            step_max[tol_key] = max(step_max[tol_key], m)

        # ---- COMPARISON 1 — tensor level ------------------------------
        td = np.abs(
            x_pil.astype(np.float64) - x_tf.astype(np.float64)
        ).ravel()
        tensor_chunks.append(td.astype(np.float32))

        # ---- inference, same model both paths ------------------------
        p_pil = clf.predict_array(x_pil)
        p_tf = clf.predict_array(x_tf)
        pdiff = np.abs(p_pil - p_tf)
        prob_chunks.append(pdiff.astype(np.float32))

        a_pil = int(np.argmax(p_pil))
        a_tf = int(np.argmax(p_tf))
        a_nb04 = ref_argmax[base]
        agree_pt = int(a_pil == a_tf)
        agree_nb04 = int(a_pil == a_nb04)
        n_pt_agree += agree_pt
        n_nb04_agree += agree_nb04

        pc = per_class.setdefault(r.cls, [0, 0, 0])
        pc[0] += agree_pt
        pc[1] += agree_nb04
        pc[2] += 1

        per_image.append(
            {
                "basename": base,
                "max_tensor_diff": float(td.max()),
                "mean_tensor_diff": float(td.mean()),
                "max_prob_diff": float(pdiff.max()),
                "argmax_tf": a_tf,
                "argmax_pil": a_pil,
                "argmax_nb04": a_nb04,
                "agree_pil_tf": agree_pt,
                "agree_pil_nb04": agree_nb04,
            }
        )

    n = len(per_image)
    skipped = n_target - n
    if n == 0:
        raise CouldNotRun("no images located — check --images-root")

    tdiff = np.concatenate(tensor_chunks)
    pdiff_all = np.concatenate(prob_chunks)
    c1 = _dist_stats(tdiff)
    c2 = _dist_stats(pdiff_all)
    c2_argmax = n_pt_agree / n
    c3_argmax = n_nb04_agree / n

    t1 = TOLERANCES["comparison1_tensor"]
    c1_band = (
        c1["max"] <= t1["max_abs_diff"]["expected_band"]
        and c1["mean"] <= t1["mean_abs_diff"]["expected_band"]
        and c1["p99"] <= t1["p99_abs_diff"]["expected_band"]
        and c1["frac_gt_0.01"] <= t1["frac_elems_gt_0.01"]["expected_band"]
    )
    c1_gate = (
        c1["max"] <= t1["max_abs_diff"]["hard_gate"]
        and c1["mean"] <= t1["mean_abs_diff"]["hard_gate"]
        and c1["p99"] <= t1["p99_abs_diff"]["hard_gate"]
        and c1["frac_gt_0.01"] <= t1["frac_elems_gt_0.01"]["hard_gate"]
    )

    t2 = TOLERANCES["comparison2_probability"]
    c2_band = (
        c2["max"] <= t2["max_abs_diff"]["expected_band"]
        and c2["mean"] <= t2["mean_abs_diff"]["expected_band"]
        and c2_argmax >= t2["argmax_agreement"]["expected_band"]
    )
    c2_gate = (
        c2["max"] <= t2["max_abs_diff"]["hard_gate"]
        and c2["mean"] <= t2["mean_abs_diff"]["hard_gate"]
        and c2_argmax >= t2["argmax_agreement"]["hard_gate"]
    )

    t3 = TOLERANCES["comparison3_vs_nb04"]["argmax_agreement"]
    c3_band = c3_argmax >= t3["expected_band"]
    c3_gate = c3_argmax >= t3["hard_gate"]

    step_report = []
    steps_within = True
    for k in PER_STEP_KEYS:
        exp = TOLERANCES["per_step_expected_max_abs_diff"][k]
        within = step_max[k] <= exp
        steps_within &= within
        step_report.append(
            {
                "checkpoint": k,
                "max_abs_diff": step_max[k],
                "expected_max_abs_diff": exp,
                "within_expectation": bool(within),
            }
        )

    per_class_report = {
        cls: {
            "argmax_agree_pil_tf": v[0] / v[2],
            "argmax_agree_pil_nb04": v[1] / v[2],
            "n": v[2],
        }
        for cls, v in sorted(per_class.items())
    }

    worst10 = sorted(
        per_image, key=lambda d: d["max_tensor_diff"], reverse=True
    )[:10]
    worst10 = [
        {"basename": d["basename"], "max_tensor_diff": d["max_tensor_diff"]}
        for d in worst10
    ]

    image_list_sha256 = hashlib.sha256(
        "\n".join(sorted(opened)).encode("utf-8")
    ).hexdigest()

    c1_verdict = _verdict(c1_band, c1_gate)
    c2_verdict = _verdict(c2_band, c2_gate)
    c3_verdict = _verdict(c3_band, c3_gate)

    hard_fail = (
        (not c1_gate)
        or (not c2_gate)
        or (not c3_gate)
        or bool(failures)
        or skipped != 0
        or (not hash_ok)
    )
    if hard_fail:
        overall = "FAIL"
        exit_code = 1
    elif not (c1_band and c2_band and c3_band and steps_within):
        overall = "PASS WITH INVESTIGATION"
        exit_code = 0
    else:
        overall = "PASS"
        exit_code = 0

    notebook_sha = (
        sha256_file(NOTEBOOK_07) if os.path.isfile(NOTEBOOK_07) else None
    )

    summary = {
        "verdict": overall,
        "exit_code": exit_code,
        "blocking": True,
        "check1_ran": True,
        "model_sha256_matches_contract": hash_ok,
        "n_images_target": n_target,
        "n_images_compared": n,
        "n_images_skipped": skipped,
        "skip_reasons": failures,
        "predicted_uint8_bound_pm1": PREDICTED_UINT8_BOUND,
        "comparison1_tensor": {
            "verdict": c1_verdict,
            "within_expected_band": bool(c1_band),
            "within_hard_gate": bool(c1_gate),
            "statistics": c1,
        },
        "comparison2_probability": {
            "verdict": c2_verdict,
            "within_expected_band": bool(c2_band),
            "within_hard_gate": bool(c2_gate),
            "statistics": c2,
            "argmax_agreement": c2_argmax,
            "argmax_agree_count": n_pt_agree,
        },
        "comparison3_vs_nb04": {
            "verdict": c3_verdict,
            "within_expected_band": bool(c3_band),
            "within_hard_gate": bool(c3_gate),
            "argmax_agreement": c3_argmax,
            "argmax_agree_count": n_nb04_agree,
            "note": (
                "coarse end-to-end sanity only; conflates TFLite quantisation, "
                "preprocessing and calibration-induced argmax sensitivity. "
                "Comparison 2 is the authoritative preprocessing measurement."
            ),
        },
        "per_step_localisation": step_report,
        "per_class_argmax_agreement": per_class_report,
        "worst_10_by_max_tensor_diff": worst10,
        "tolerances_as_applied": TOLERANCES,
        "environment": {**env, "tflite_runtime": clf.runtime},
        "hashes": {
            "model": clf.model_sha256,
            "model_contract_pinned": contract.MODEL_SHA256,
            "manifest": sha256_file(args.manifest),
            "reference_csv": sha256_file(args.reference),
            "notebook_07": notebook_sha,
            "image_list_sha256": image_list_sha256,
            "image_list_count": len(opened),
        },
        "inputs": {
            "images_root": args.images_root,
            "manifest": os.path.abspath(args.manifest),
            "reference": os.path.abspath(args.reference),
            "model": os.path.abspath(args.model),
            "limit": args.limit,
        },
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }

    _write_json(os.path.join(out_dir, "a1_parity_summary.json"), summary)
    _write_csv(
        os.path.join(out_dir, "a1_parity_per_image.csv"),
        per_image,
        [
            "basename",
            "max_tensor_diff",
            "mean_tensor_diff",
            "max_prob_diff",
            "argmax_tf",
            "argmax_pil",
            "argmax_nb04",
            "agree_pil_tf",
            "agree_pil_nb04",
        ],
    )
    _write_csv(
        os.path.join(out_dir, "a1_parity_per_step.csv"),
        step_report,
        ["checkpoint", "max_abs_diff", "expected_max_abs_diff", "within_expectation"],
    )

    _print_core(summary)
    return exit_code


# -------------------------------------------------------------------------
# A1-EXT (diagnostic, non-blocking, cannot pass or fail)
# -------------------------------------------------------------------------

def run_ext(args, clf, val, env, out_dir):
    from PIL import Image

    n_source = args.upscale_source
    method_name = "PIL.Image.BICUBIC"

    rows = val
    if args.limit and args.limit > 0:
        rows = rows.iloc[: args.limit].copy()

    tensor_chunks: list[np.ndarray] = []
    prob_chunks: list[np.ndarray] = []
    n_agree = 0
    n = 0

    for r in rows.itertuples(index=False, name="Row"):
        base = r.basename
        path = r.abs_path
        _assert_open_allowed(base, path)
        if not os.path.isfile(path):
            continue

        with Image.open(path) as im:
            im.load()
            up = im.convert("L").resize((n_source, n_source), Image.BICUBIC)

        x_pil = preprocess(up)

        import tensorflow as tf

        arr = np.asarray(up, dtype=np.uint8)[..., None]
        x_tf = _tf_final_from_decoded(tf.convert_to_tensor(arr))

        td = np.abs(
            x_pil.astype(np.float64) - x_tf.astype(np.float64)
        ).ravel()
        tensor_chunks.append(td.astype(np.float32))

        p_pil = clf.predict_array(x_pil)
        p_tf = clf.predict_array(x_tf)
        prob_chunks.append(np.abs(p_pil - p_tf).astype(np.float32))
        n_agree += int(np.argmax(p_pil) == np.argmax(p_tf))
        n += 1

    ext = {
        "blocking": False,
        "verdict": "NO VERDICT — characterisation only",
        "cannot_pass_or_fail": True,
        "upscale_source_size": n_source,
        "upscale_method": method_name,
        "n_images": n,
        "comparison1_tensor": _dist_stats(np.concatenate(tensor_chunks)),
        "comparison2_probability": _dist_stats(np.concatenate(prob_chunks)),
        "argmax_agreement_pil_vs_tf": (n_agree / n) if n else None,
        "note": (
            "Each VAL image was upscaled 48 -> "
            f"{n_source} once ({method_name}) before BOTH pipelines, making step 2 "
            "a genuine downscale — the regime where PIL antialiases and TF "
            "(antialias=False) does not. No ground truth exists for a "
            f"{n_source}x{n_source} source; the model was never fed one during "
            "training. This reports an effect size for OPEN-5 / proposal P-1, "
            "nothing more."
        ),
        "environment": {**env, "tflite_runtime": clf.runtime},
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    _write_json(os.path.join(out_dir, "a1_parity_ext_summary.json"), ext)

    print("\n--- A1-EXT (non-blocking, no verdict) ---")
    print(f"  upscale        : 48 -> {n_source}  ({method_name})")
    print(f"  images         : {n}")
    print(
        f"  tensor max/mean: {ext['comparison1_tensor']['max']:.6f} / "
        f"{ext['comparison1_tensor']['mean']:.6f}"
    )
    print(
        f"  prob max/mean  : {ext['comparison2_probability']['max']:.6f} / "
        f"{ext['comparison2_probability']['mean']:.6f}"
    )
    print(f"  argmax agree   : {ext['argmax_agreement_pil_vs_tf']}")
    return 0


# -------------------------------------------------------------------------
# Output helpers
# -------------------------------------------------------------------------

def _write_json(path: str, obj: dict) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, sort_keys=True, default=str)
        fh.write("\n")
    print(f"wrote {path}")


def _write_csv(path: str, rows: list[dict], columns: list[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=columns)
        w.writeheader()
        for row in rows:
            w.writerow({c: row.get(c) for c in columns})
    print(f"wrote {path}")


def _print_core(s: dict) -> None:
    print("\n================ A1-CORE ================")
    print(f"images compared : {s['n_images_compared']}  (skipped {s['n_images_skipped']})")
    print(f"model sha256 ok : {s['model_sha256_matches_contract']}")
    c1 = s["comparison1_tensor"]
    print("\nCOMPARISON 1 — tensor ([-1,1] space), model held constant")
    print(
        f"  max  {c1['statistics']['max']:.6f}  mean {c1['statistics']['mean']:.6f}"
        f"  p99 {c1['statistics']['p99']:.6f}  -> {c1['verdict']}"
    )
    c2 = s["comparison2_probability"]
    print("\nCOMPARISON 2 — probabilities (same model, two preprocessing paths)")
    print(
        f"  max prob diff {c2['statistics']['max']:.6f}  argmax agree "
        f"{c2['argmax_agreement']:.4f}  -> {c2['verdict']}"
    )
    c3 = s["comparison3_vs_nb04"]
    print("\nCOMPARISON 3 — argmax vs notebook 04 (coarse sanity)")
    print(f"  argmax agree {c3['argmax_agreement']:.4f}  -> {c3['verdict']}")
    print("\nper-step localisation (first non-zero checkpoint is the cause):")
    for step in s["per_step_localisation"]:
        flag = "ok" if step["within_expectation"] else "INVESTIGATE"
        print(
            f"  {step['checkpoint']:34s} max {step['max_abs_diff']:.6f}"
            f"  (expect <= {step['expected_max_abs_diff']})  {flag}"
        )
    print(f"\nOVERALL: {s['verdict']}  (exit {s['exit_code']})")
    if s["verdict"] == "FAIL":
        print(
            "DO NOT PROCEED TO A2. Diagnose via plan §10. Adjusting a tolerance is "
            "never a fix."
        )
    elif s["verdict"] == "PASS WITH INVESTIGATION":
        print(
            "Hard gates met but a statistic is outside its expected band. Record "
            "the cause in A1_PARITY_FINDINGS.md via plan §10 before A2."
        )


# -------------------------------------------------------------------------
# main
# -------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="FER A1 preprocessing parity verifier")
    ap.add_argument("--images-root", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--model", default="models/" + contract.MODEL_FILENAME)
    ap.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    ap.add_argument(
        "--limit",
        type=int,
        default=0,
        help="0 (default) = full VAL split (3589 images). >0 = first N, manifest order.",
    )
    ap.add_argument(
        "--upscale-source",
        type=int,
        default=0,
        help="A1-EXT: upscale each VAL image 48->N before both pipelines (non-blocking).",
    )
    ap.add_argument(
        "--diagnostic-only",
        action="store_true",
        help="run ONLY A1-EXT (requires --upscale-source). Always exits 0.",
    )
    args = ap.parse_args()

    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    try:
        if args.diagnostic_only and args.upscale_source <= 48:
            raise CouldNotRun(
                "--diagnostic-only requires --upscale-source N with N > 48"
            )

        env = _build_env()

        for label, p in (
            ("images-root", args.images_root),
            ("manifest", args.manifest),
            ("reference", args.reference),
            ("model", args.model),
        ):
            if label == "images-root":
                if not os.path.isdir(p):
                    raise CouldNotRun(f"--images-root not a directory: {p}")
            elif not os.path.isfile(p):
                raise CouldNotRun(f"--{label} not found: {p}")

        val = _load_val_manifest(args.manifest, args.images_root)
        ref_argmax = _load_reference(args.reference, set(val["basename"]))

        clf = FERClassifier(args.model, verify_sha256=False)
        hash_ok = clf.model_sha256 == contract.MODEL_SHA256
        print(f"model   : {args.model}")
        print(f"sha256  : {clf.model_sha256}  (contract match: {hash_ok})")
        print(f"runtime : {clf.runtime}")

        if args.diagnostic_only:
            return run_ext(args, clf, val, env, out_dir)

        exit_code = run_core(args, clf, val, ref_argmax, env, out_dir, hash_ok)

        if args.upscale_source > 48:
            run_ext(args, clf, val, env, out_dir)  # non-blocking, ignore its code

        return exit_code

    except GuardTripped as exc:
        print(f"\nGUARD TRIPPED — FAIL: {exc}")
        _write_json(
            os.path.join(out_dir, "a1_parity_summary.json"),
            {
                "verdict": "FAIL",
                "exit_code": 1,
                "reason": f"guard tripped: {exc}",
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            },
        )
        return 1
    except ContractViolationError as exc:
        # The loaded model does not match the tensor contract. That is a FAIL,
        # not a structural inability to run.
        print(f"\nCONTRACT VIOLATION — FAIL: {exc.message} ({exc.detail})")
        _write_json(
            os.path.join(out_dir, "a1_parity_summary.json"),
            {
                "verdict": "FAIL",
                "exit_code": 1,
                "reason": f"contract violation: {exc.detail}",
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            },
        )
        return 1
    except (CouldNotRun, FERServiceError) as exc:
        # FERServiceError here is almost always ModelLoadError — no TFLite runtime
        # available. That is a structural inability to run (exit 2), NOT a pass and
        # NOT a parity failure. Write the artifact so the reason is recorded.
        detail = getattr(exc, "detail", None) or str(exc)
        print(f"\nCOULD NOT RUN (exit 2, NOT a pass): {detail}")
        _write_json(
            os.path.join(out_dir, "a1_parity_summary.json"),
            {
                "verdict": "COULD NOT RUN",
                "exit_code": 2,
                "reason": detail,
                "note": "exit 2 is NOT a pass; A1 is only satisfied by a measured pass",
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            },
        )
        return 2


if __name__ == "__main__":
    # TensorFlow's teardown overrides the process exit status in TF 2.21 (A1,
    # 2026-08-29: main() returned 1 but the process exited 0). os._exit bypasses
    # atexit handlers entirely. Flush first — os._exit does not flush buffers.
    _code = main()
    # D5 (A2, 2026-08-29): under a pipe, a flush of a partially-written buffer can
    # raise BrokenPipeError, which would mask main()'s real exit code with a 1 and
    # discard buffered stdout. Swallow it — teardown only, no measurement changes.
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except BrokenPipeError:
        pass
    os._exit(_code)
