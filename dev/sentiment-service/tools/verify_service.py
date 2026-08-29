"""B2-A — HTTP service verification for the Sinhala sentiment package.

ONE RUN, THEN REPORT. This script does not iterate toward a pass. It does not
relax a tolerance, add rounding, or retry variations. A FAIL is the deliverable.

What it measures (plan docs/plan/SENTIMENT_B2_SERVICE_VERIFICATION_PLAN.md §4.2):

  T1  routes reachable; typed errors survive the exception handler
  T2  GET /health   — checkpoint SHA matches the pin; torch thread count == 1
  T3  GET /contract — matches contract.py / errors.py exactly; no extra fields
  T4  *** CORE *** HTTP vs in-process, ALL 76 validation records
        GATE: max abs prob diff <= 1e-9  AND  argmax 76/76
  T5  every error code errors.ALL_ERROR_CODES defines -> typed code + http_status
  T6  NO TEXT RETENTION — nothing logged, echoed, or written to disk
  T7  UTF-8 Sinhala (incl. combining marks, ZWJ, ZWNJ) round-trips BYTE-IDENTICALLY
  T8  English input — OBSERVE and record only (no verdict, no language gate)

The app runs in-process via fastapi.testclient.TestClient (real ASGI, real JSON
serialise/parse). Nothing binds to a socket.

FROZEN TEST IS CLOSED. B1's five guards are reused verbatim; the sorted record_id
SHA-256 must equal B1's 36640459b468785809101353f091d9ecb25df7dc410c639d1048c304a41ce37d
or the run stops.

NO TEXT CONTENT IN ANY ARTIFACT. Record ids and numbers only.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import platform
import sys
import warnings
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
SERVICE_ROOT = HERE.parent                       # dev/sentiment-service
REPO = SERVICE_ROOT.parent.parent                # IT22638168
sys.path.insert(0, str(SERVICE_ROOT))

# The service must never see a debug flag during this run (T6).
os.environ.pop("SENTIMENT_DEBUG", None)

import torch  # noqa: E402
import tokenizers as _tokenizers  # noqa: E402
import transformers as _transformers  # noqa: E402
import fastapi as _fastapi  # noqa: E402
import starlette as _starlette  # noqa: E402
import pydantic as _pydantic  # noqa: E402
import pydantic_core as _pydantic_core  # noqa: E402
import uvicorn as _uvicorn  # noqa: E402
import httpx as _httpx  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from sentiment_service import contract, errors  # noqa: E402
from sentiment_service.inference import sha256_file  # noqa: E402

SENTIMENT = REPO / "ml" / "sentiment"
DEV2_CSV = SENTIMENT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2.csv"
SPLIT_CSV = SENTIMENT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2_split_membership.csv"
VAL_PRED_CSV = SENTIMENT / "outputs" / "development_v2" / "experiment_02" / "validation_predictions.csv"
CHECKPOINT_DIR = SENTIMENT / "outputs" / "development_v2" / "experiment_02" / "best_checkpoint"
OUT_DIR = SENTIMENT / "outputs" / "b2_service"

DENYLIST = ("PREGNANCY_FROZEN_TEST_SET", "frozen_test", "final_evaluation")
B1_SORTED_RECORD_ID_SHA256 = (
    "36640459b468785809101353f091d9ecb25df7dc410c639d1048c304a41ce37d"
)

# T4 gate — declared before the run, NOT negotiable (plan §4.2).
T4_MAX_ABS_DIFF_GATE = 1e-9
T4_ARGMAX_REQUIRED = 76

LABEL_ORDER = list(contract.LABEL_ORDER)
LABEL_TO_IDX = {name: i for i, name in enumerate(contract.LABEL_ORDER)}

# English probes for T8 — OBSERVATION ONLY. Not stored in any artifact as text;
# only their index and the resulting numbers are recorded.
ENGLISH_PROBES = [
    "I am feeling completely calm and relaxed today.",
    "The appointment is scheduled for next Tuesday morning.",
    "I am terrified something is wrong with the baby and I cannot stop crying.",
    "Everything is fine, nothing to report.",
    "Please help me, the pain is unbearable and I am very scared.",
]

# Sinhala probes for T7 — combining marks, ZWJ (U+200D), ZWNJ (U+200C).
# Built with explicit escapes so the joiners are unambiguous in source.
_ZWJ = "‍"
_ZWNJ = "‌"
SINHALA_PROBES = [
    "අම්මා සූදානම්",  # "අම්මා සූදානම්" — virama + combining vowel signs
    "ක්" + _ZWJ + "රියා",  # "ක්‍රියා" — ZWJ conjunct
    "ක්" + _ZWNJ + "රියා",  # explicit-virama form — ZWNJ
    "මට කැමතියි",  # "මට කැමතියි"
]


class GuardTripped(SystemExit):
    pass


# ---------------------------------------------------------------------------
# Frozen-test guards (B1, verbatim)
# ---------------------------------------------------------------------------


def _denylist_check(path: Path) -> None:
    low = str(path).lower()
    for banned in DENYLIST:
        if banned.lower() in low:
            raise GuardTripped(f"GUARD TRIPPED (denylist): refusing to touch {path}")


def guarded_read_csv(path: Path) -> pd.DataFrame:
    _denylist_check(path)
    if not path.is_file():
        raise GuardTripped(f"GUARD TRIPPED (open-time): required input missing: {path}")
    return pd.read_csv(path)


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def load_validation_texts() -> tuple[list[str], list[str], dict]:
    """Return (record_ids, texts, guards) for exactly the 76 VALIDATION records,
    reconstructed identically to B1 (dataset row order)."""
    guards: dict = {}
    for path in (DEV2_CSV, SPLIT_CSV, VAL_PRED_CSV, CHECKPOINT_DIR):
        _denylist_check(path)
    guards["denylist_checked_paths"] = [DEV2_CSV.name, SPLIT_CSV.name, VAL_PRED_CSV.name]

    split = guarded_read_csv(SPLIT_CSV)
    val_split = split[split["split"] == "validation"]
    n_val = len(val_split)
    if n_val != 76:
        raise GuardTripped(f"GUARD 1 FAILED: validation split has {n_val} rows, expected 76")
    guards["guard_1_validation_row_count"] = n_val
    val_ids = val_split["record_id"].tolist()

    ref = guarded_read_csv(VAL_PRED_CSV)
    ref_ids = set(ref["record_id"].astype(str))
    missing = [r for r in val_ids if str(r) not in ref_ids]
    if missing:
        raise GuardTripped(f"GUARD 2 FAILED: {len(missing)} validation ids not in reference")
    if len(ref) != 76:
        raise GuardTripped(f"GUARD 2 FAILED: reference has {len(ref)} rows, expected 76")
    guards["guard_2_all_ids_in_reference"] = True

    development = guarded_read_csv(DEV2_CSV)
    if set(development["language"]) != {"si"}:
        raise GuardTripped("dev-v2 not all Sinhala")
    val = development[development["record_id"].isin(set(val_ids))].copy()
    if len(val) != 76:
        raise GuardTripped(f"reconstructed val has {len(val)} rows, expected 76")
    val_records = [str(r) for r in val["record_id"].tolist()]
    val_texts = [str(t) for t in val["text"].tolist()]

    sorted_ids = sorted(val_records)
    ids_sha = sha256_text("\n".join(sorted_ids) + "\n")
    guards["guard_5_record_count"] = len(sorted_ids)
    guards["guard_5_sorted_record_id_sha256"] = ids_sha
    guards["guard_5_matches_b1"] = ids_sha == B1_SORTED_RECORD_ID_SHA256
    if ids_sha != B1_SORTED_RECORD_ID_SHA256:
        raise GuardTripped(
            "GUARD 5 FAILED: sorted record_id SHA-256 "
            f"{ids_sha} != B1 {B1_SORTED_RECORD_ID_SHA256} — not the same records"
        )

    # Build the reference argmax per id for T4 sanity (argmax only; not gated
    # against B1 probabilities — that was B1's job).
    ref_arg = {
        str(row["record_id"]): LABEL_TO_IDX[str(row["predicted_label"])]
        for _, row in ref.iterrows()
    }
    guards["_ref_argmax"] = ref_arg
    return val_records, val_texts, guards


# ---------------------------------------------------------------------------
# Log / stdout / filesystem capture for T6
# ---------------------------------------------------------------------------


class ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.messages.append(record.getMessage())
        except Exception:  # noqa: BLE001
            self.messages.append(str(record.msg))


def snapshot_files(dirs: list[Path]) -> set[str]:
    seen: set[str] = set()
    for d in dirs:
        if not d.is_dir():
            continue
        for root, _, files in os.walk(d):
            for f in files:
                seen.add(str(Path(root) / f))
    return seen


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main() -> int:
    started = datetime.now(timezone.utc).isoformat()

    # Byte-identity of the B1-certified modules (not modified by B2-A).
    certified = {
        "preprocessing.py": sha256_file(
            str(SERVICE_ROOT / "sentiment_service" / "preprocessing.py")
        ),
        "inference.py": sha256_file(
            str(SERVICE_ROOT / "sentiment_service" / "inference.py")
        ),
    }

    val_records, val_texts, guards = load_validation_texts()
    ref_argmax = guards.pop("_ref_argmax")

    # ---- T6 capture arm: BEFORE anything touches the app ------------------
    root_logger = logging.getLogger()
    prev_level = root_logger.level
    root_logger.setLevel(logging.DEBUG)
    cap = ListHandler()
    root_logger.addHandler(cap)
    warn_records: list[str] = []
    _orig_showwarning = warnings.showwarning

    def _capturing_showwarning(message, category, filename, lineno, file=None, line=None):
        warn_records.append(str(message))

    warnings.showwarning = _capturing_showwarning

    watched_dirs = [
        SERVICE_ROOT,
        REPO / "ml" / "sentiment" / "outputs",
        Path(os.environ.get("TEMP", "")) if os.environ.get("TEMP") else Path.cwd(),
        Path.cwd(),
    ]
    files_before = snapshot_files([d for d in watched_dirs if d.is_dir()])

    stdout_buf, stderr_buf = io.StringIO(), io.StringIO()

    results: dict = {}
    consistency_rows: list[dict] = []

    with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
        import app as app_module  # noqa: E402  (import here so startup is captured)

        with TestClient(app_module.app) as client:
            clf = app_module.get_classifier()
            thread_count = torch.get_num_threads()

            # T6 arm: snapshot AFTER model load, BEFORE any /predict, so the
            # comparison isolates what *serving requests* writes from what
            # loading the checkpoint writes (HF cache locks etc.).
            files_after_load = snapshot_files([d for d in watched_dirs if d.is_dir()])

            # ============================================================
            # T1 — routes reachable + typed error survives the handler
            # ============================================================
            r_health = client.get("/health")
            r_contract = client.get("/contract")
            r_predict_ok = client.post("/predict", json={"text": val_texts[0]})
            r_predict_nobody = client.post("/predict")
            handler_body = r_predict_nobody.json()
            t1_handler_ok = (
                r_predict_nobody.status_code == 400
                and r_predict_nobody.headers.get("content-type", "").startswith(
                    "application/json"
                )
                and handler_body.get("error", {}).get("code") == "missing_text"
                and set(handler_body) == {"error"}
                and set(handler_body["error"]) == {"code", "message"}
            )
            t1_ok = (
                r_health.status_code == 200
                and r_contract.status_code == 200
                and r_predict_ok.status_code == 200
                and t1_handler_ok
            )
            results["T1"] = {
                "verdict": "PASS" if t1_ok else "FAIL",
                "status_codes": {
                    "GET /health": r_health.status_code,
                    "GET /contract": r_contract.status_code,
                    "POST /predict (valid)": r_predict_ok.status_code,
                    "POST /predict (no body)": r_predict_nobody.status_code,
                },
                "typed_error_survives_handler": t1_handler_ok,
                "no_body_error_body": handler_body,
            }

            # ============================================================
            # T2 — GET /health
            # ============================================================
            hb = r_health.json()
            t2_checks = {
                "status_ok": hb.get("status") == "ok",
                "checkpoint_sha256_matches_pin": hb.get("checkpoint_sha256")
                == contract.CHECKPOINT_SHA256,
                "checkpoint_sha256_matches_pin_flag": hb.get(
                    "checkpoint_sha256_matches_pin"
                )
                is True,
                "torch_num_threads_is_1": hb.get("torch_num_threads") == 1,
                "model_version_present": hb.get("model_version")
                == contract.MODEL_VERSION,
                "label_space_mood3": hb.get("label_space") == "mood3",
                "response_probabilities_rounded_false": hb.get(
                    "response_probabilities_rounded"
                )
                is False,
            }
            results["T2"] = {
                "verdict": "PASS" if all(t2_checks.values()) else "FAIL",
                "checks": t2_checks,
                "body": hb,
            }

            # ============================================================
            # T3 — GET /contract matches contract.py / errors.py exactly
            # ============================================================
            cb = r_contract.json()
            expected_top_keys = {
                "model_version",
                "service_version",
                "label_space",
                "label_order",
                "deployed_evidence_keys",
                "input",
                "output",
                "prediction_rule",
                "device",
                "dtype",
                "supported_language",
                "english_in_scope",
                "checkpoint",
                "provenance",
                "measured_performance",
                "limitations",
                "out_of_scope",
                "error_codes",
            }
            t3_checks = {
                "no_undocumented_top_level_fields": set(cb) == expected_top_keys,
                "model_version": cb.get("model_version") == contract.MODEL_VERSION,
                "service_version": cb.get("service_version")
                == contract.SERVICE_VERSION,
                "label_space": cb.get("label_space") == "mood3",
                "label_order": cb.get("label_order") == list(contract.LABEL_ORDER),
                "deployed_evidence_keys": cb.get("deployed_evidence_keys")
                == list(contract.DEPLOYED_EVIDENCE_KEYS),
                "input_endpoint": cb.get("input", {}).get("endpoint")
                == "POST /predict",
                "input_encoding_json": cb.get("input", {}).get("encoding")
                == "application/json",
                "input_field_text": cb.get("input", {}).get("field") == "text",
                "input_text_normalisation": cb.get("input", {}).get(
                    "text_normalisation"
                )
                == contract.TEXT_NORMALISATION,
                "input_max_length": cb.get("input", {}).get("max_length_tokens")
                == contract.MAX_LENGTH,
                "input_truncation": cb.get("input", {}).get("truncation")
                == contract.TRUNCATION,
                "output_rounding_none": cb.get("output", {}).get("rounding")
                == "none - full float precision is serialised",
                "prediction_rule": cb.get("prediction_rule")
                == contract.PREDICTION_RULE,
                "device": cb.get("device") == contract.DEVICE,
                "dtype": cb.get("dtype") == contract.DTYPE,
                "supported_language": cb.get("supported_language")
                == contract.SUPPORTED_LANGUAGE,
                "english_in_scope": cb.get("english_in_scope")
                == contract.ENGLISH_IN_SCOPE,
                "checkpoint_sha256": cb.get("checkpoint", {}).get("sha256")
                == contract.CHECKPOINT_SHA256,
                "checkpoint_name": cb.get("checkpoint", {}).get("name")
                == contract.CHECKPOINT_NAME,
                "checkpoint_architecture": cb.get("checkpoint", {}).get(
                    "architecture"
                )
                == contract.ARCHITECTURE,
                "provenance_matches": cb.get("provenance") == contract.PROVENANCE,
                "measured_performance_matches": cb.get("measured_performance")
                == contract.MEASURED_PERFORMANCE,
                "limitations_matches": cb.get("limitations")
                == list(contract.KNOWN_LIMITATIONS),
                "out_of_scope_matches": cb.get("out_of_scope")
                == list(contract.OUT_OF_SCOPE),
                "error_codes_matches": cb.get("error_codes")
                == sorted(errors.ALL_ERROR_CODES),
            }
            results["T3"] = {
                "verdict": "PASS" if all(t3_checks.values()) else "FAIL",
                "checks": t3_checks,
                "undocumented_fields": sorted(set(cb) - expected_top_keys),
                "body": cb,
            }

            # ============================================================
            # T4 — CORE: HTTP vs in-process, all 76 validation records
            # ============================================================
            all_abs: list[float] = []
            argmax_agree = 0
            argmax_vs_ref = 0
            for rid, text in zip(val_records, val_texts):
                http = client.post("/predict", json={"text": text}).json()
                inproc = clf.predict(text)
                hv = [http["probabilities"][name] for name in LABEL_ORDER]
                iv = [inproc["probabilities"][name] for name in LABEL_ORDER]
                diffs = [abs(hv[i] - iv[i]) for i in range(3)]
                all_abs.extend(diffs)
                a_http = int(np.argmax(hv))
                a_in = int(np.argmax(iv))
                agree = a_http == a_in
                argmax_agree += int(agree)
                argmax_vs_ref += int(a_http == ref_argmax[rid])
                consistency_rows.append(
                    {
                        "record_id": rid,
                        "max_abs_prob_diff": max(diffs),
                        "argmax_http": a_http,
                        "argmax_inprocess": a_in,
                        "argmax_agree": agree,
                    }
                )
            arr = np.array(all_abs, dtype=np.float64)
            t4_max = float(arr.max())
            t4_mean = float(arr.mean())
            t4_ok = (
                t4_max <= T4_MAX_ABS_DIFF_GATE
                and argmax_agree == T4_ARGMAX_REQUIRED
            )
            results["T4"] = {
                "verdict": "PASS" if t4_ok else "FAIL",
                "n_records": len(val_records),
                "n_prob_elements": int(arr.size),
                "max_abs_prob_diff": t4_max,
                "mean_abs_prob_diff": t4_mean,
                "argmax_agreement_http_vs_inprocess": f"{argmax_agree}/76",
                "argmax_agreement_http_vs_b1_reference": f"{argmax_vs_ref}/76",
                "gate_max_abs_prob_diff": T4_MAX_ABS_DIFF_GATE,
                "gate_argmax_required": T4_ARGMAX_REQUIRED,
            }

            # ============================================================
            # T5 — every error code errors.ALL_ERROR_CODES defines
            # ============================================================
            # Directly reachable via the HTTP contract:
            direct_cases = [
                ("no 'text' key", {"json": {}}, "missing_text", 400),
                ("text is null", {"json": {"text": None}}, "missing_text", 400),
                ("text is int (non-str)", {"json": {"text": 123}}, "missing_text", 400),
                ("empty string", {"json": {"text": ""}}, "empty_text", 400),
                ("whitespace only", {"json": {"text": "   \t\n"}}, "empty_text", 400),
            ]
            t5_rows: list[dict] = []
            t5_ok = True
            for name, kw, exp_code, exp_status in direct_cases:
                resp = client.post("/predict", **kw)
                b = resp.json()
                err = b.get("error", {})
                match = (
                    err.get("code") == exp_code
                    and resp.status_code == exp_status
                    and set(b) == {"error"}
                    and set(err) == {"code", "message"}
                )
                t5_ok &= match
                t5_rows.append(
                    {
                        "trigger": name,
                        "how": "HTTP contract (real check_text path)",
                        "expected_code": exp_code,
                        "actual_code": err.get("code"),
                        "expected_status": exp_status,
                        "actual_status": resp.status_code,
                        "envelope_only_code_message": set(err) == {"code", "message"},
                        "match": match,
                    }
                )

            # Every SentimentServiceError subclass (and the base) driven through
            # the REAL registered exception handler by making predict() raise it.
            error_classes = [
                errors.MissingTextError,
                errors.EmptyTextError,
                errors.TextTooLongError,
                errors.TokenisationError,
                errors.ModelLoadError,
                errors.InferenceError,
                errors.ContractViolationError,
                errors.SentimentServiceError,
            ]
            real_predict = clf.predict
            for cls in error_classes:
                exc = cls()

                def _raiser(_text, _exc=exc):
                    raise _exc

                clf.predict = _raiser
                try:
                    resp = client.post("/predict", json={"text": "අ"})
                finally:
                    clf.predict = real_predict
                b = resp.json()
                err = b.get("error", {})
                match = (
                    err.get("code") == cls.code
                    and resp.status_code == cls.http_status
                    and set(b) == {"error"}
                    and set(err) == {"code", "message"}
                )
                t5_ok &= match
                t5_rows.append(
                    {
                        "trigger": f"predict() raises {cls.__name__}",
                        "how": "forced through the registered exception handler",
                        "expected_code": cls.code,
                        "actual_code": err.get("code"),
                        "expected_status": cls.http_status,
                        "actual_status": resp.status_code,
                        "envelope_only_code_message": set(err) == {"code", "message"},
                        "match": match,
                    }
                )
            covered = {row["actual_code"] for row in t5_rows if row["match"]}
            t5_all_codes_covered = set(errors.ALL_ERROR_CODES) <= covered
            t5_ok &= t5_all_codes_covered
            results["T5"] = {
                "verdict": "PASS" if t5_ok else "FAIL",
                "all_error_codes": sorted(errors.ALL_ERROR_CODES),
                "codes_covered": sorted(covered),
                "all_codes_covered": t5_all_codes_covered,
                "rows": t5_rows,
            }

            # ============================================================
            # T7 — Sinhala UTF-8 byte-identity round-trip
            # ============================================================
            captured_texts: list[str] = []
            real_predict = clf.predict

            def _capture(text, _real=real_predict):
                captured_texts.append(text)
                return _real(text)

            clf.predict = _capture
            t7_rows: list[dict] = []
            try:
                for i, s in enumerate(SINHALA_PROBES):
                    captured_texts.clear()
                    resp = client.post("/predict", json={"text": s})
                    got = captured_texts[-1] if captured_texts else None
                    sent_bytes = s.encode("utf-8")
                    got_bytes = got.encode("utf-8") if isinstance(got, str) else b""
                    identical = sent_bytes == got_bytes
                    t7_rows.append(
                        {
                            "probe_index": i,
                            "status_code": resp.status_code,
                            "sent_utf8_len": len(sent_bytes),
                            "received_utf8_len": len(got_bytes),
                            "sent_sha256": hashlib.sha256(sent_bytes).hexdigest(),
                            "received_sha256": hashlib.sha256(got_bytes).hexdigest(),
                            "codepoints_sent": [f"U+{ord(c):04X}" for c in s],
                            "byte_identical": identical,
                            "contains_zwj": "‍" in s,
                            "contains_zwnj": "‌" in s,
                        }
                    )
            finally:
                clf.predict = real_predict
            t7_ok = all(row["byte_identical"] for row in t7_rows)
            results["T7"] = {
                "verdict": "PASS" if t7_ok else "FAIL",
                "rows": t7_rows,
            }

            # ============================================================
            # T8 — English input: OBSERVE only, no verdict
            # ============================================================
            t8_rows: list[dict] = []
            for i, s in enumerate(ENGLISH_PROBES):
                b = client.post("/predict", json={"text": s}).json()
                t8_rows.append(
                    {
                        "probe_index": i,
                        "predicted_label": b.get("predicted_label"),
                        "predicted_label_id": b.get("predicted_label_id"),
                        "confidence": b.get("confidence"),
                        "probabilities": b.get("probabilities"),
                    }
                )
            labels = [row["predicted_label"] for row in t8_rows]
            results["T8"] = {
                "verdict": "OBSERVED",
                "n_probes": len(t8_rows),
                "predicted_labels": labels,
                "all_calm": all(x == "CALM" for x in labels),
                "note": (
                    "English is OUT OF SCOPE (contract.ENGLISH_IN_SCOPE is False). "
                    "The service applies no language gate and scores English "
                    "through the same path as Sinhala. Recorded, not judged."
                ),
                "rows": t8_rows,
            }

            # ============================================================
            # T6 — no text retention (evaluate captured sinks)
            # ============================================================
            # Run one more batch of real validation texts to give logging a
            # chance to leak, then inspect every sink.
            for text in val_texts:
                client.post("/predict", json={"text": text})

            files_after_requests = snapshot_files(
                [d for d in watched_dirs if d.is_dir()]
            )

    # ---- restore global state --------------------------------------------
    warnings.showwarning = _orig_showwarning
    root_logger.removeHandler(cap)
    root_logger.setLevel(prev_level)

    log_blob = "\n".join(cap.messages)
    warn_blob = "\n".join(warn_records)
    stdout_text = stdout_buf.getvalue()
    stderr_text = stderr_buf.getvalue()
    all_sink_text = "\n".join([log_blob, warn_blob, stdout_text, stderr_text])

    probe_texts = list(val_texts) + SINHALA_PROBES + ENGLISH_PROBES

    def _contains_probe(blob: str) -> list[int]:
        hits: list[int] = []
        for i, t in enumerate(probe_texts):
            if not t:
                continue
            if t in blob or (len(t) >= 12 and t[:12] in blob):
                hits.append(i)
        return hits

    leaked_sinks = _contains_probe(all_sink_text)

    # Files created WHILE SERVING REQUESTS (model-load-time cache files excluded).
    new_during_requests = sorted(
        f for f in (files_after_requests - files_after_load) if "__pycache__" not in f
    )
    # Files created during the whole run (load + serve), reported for transparency.
    new_whole_run = sorted(
        f for f in (files_after_requests - files_before) if "__pycache__" not in f
    )

    file_findings = []
    request_text_on_disk = False
    service_area_write = False
    service_area = (str(SERVICE_ROOT), str(REPO / "ml" / "sentiment" / "outputs"))
    for f in new_during_requests:
        p = Path(f)
        size = p.stat().st_size if p.is_file() else -1
        contains_text = False
        if size > 0 and p.is_file():
            try:
                raw = p.read_bytes()
                contains_text = bool(_contains_probe(raw.decode("utf-8", "ignore")))
            except Exception:  # noqa: BLE001
                contains_text = False
        in_service_area = f.startswith(service_area)
        if contains_text:
            request_text_on_disk = True
        if in_service_area:
            service_area_write = True
        file_findings.append(
            {
                "path": f,
                "size_bytes": size,
                "in_service_or_output_area": in_service_area,
                "contains_request_text": contains_text,
            }
        )

    t6_ok = (
        not leaked_sinks
        and not request_text_on_disk
        and not service_area_write
        and app_module.INCLUDE_ERROR_DETAIL is False
    )
    results["T6"] = {
        "verdict": "PASS" if t6_ok else "FAIL",
        "how_proven": [
            "root logger captured at DEBUG for the whole run (every handler)",
            "warnings.showwarning intercepted for the whole run",
            "stdout and stderr redirected to in-memory buffers for the whole run",
            "filesystem snapshot after model-load vs after serving all requests, "
            "so checkpoint-cache files are excluded and only request-phase writes "
            "are judged",
            "every new request-phase file stat'd and its bytes scanned for any "
            "request text",
            "all 85 request texts (76 val + 4 Sinhala + 5 English) checked as full "
            "string and 12-char prefix against the concatenation of every sink",
            "INCLUDE_ERROR_DETAIL asserted False; every error envelope asserted to "
            "contain exactly {code, message} (no detail, no echo)",
        ],
        "request_texts_leaked_into_log_or_stdio": leaked_sinks,
        "request_phase_new_files": file_findings,
        "any_request_text_written_to_disk": request_text_on_disk,
        "any_write_into_service_or_output_area": service_area_write,
        "new_files_whole_run_load_and_serve": new_whole_run,
        "n_log_records_captured": len(cap.messages),
        "n_warning_records_captured": len(warn_records),
        "stdout_chars": len(stdout_text),
        "stderr_chars": len(stderr_text),
        "stderr_text": stderr_text,
        "include_error_detail": app_module.INCLUDE_ERROR_DETAIL,
    }

    finished = datetime.now(timezone.utc).isoformat()

    # ---- environment ----------------------------------------------------
    environment = {
        "sys_executable": sys.executable,
        "python_version": sys.version,
        "python_version_short": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "conda_env": os.environ.get("CONDA_DEFAULT_ENV"),
        "numerical_stack_b1_pinned": {
            "torch": torch.__version__,
            "transformers": _transformers.__version__,
            "tokenizers": _tokenizers.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "service_layer_installed_for_b2": {
            "fastapi": _fastapi.__version__,
            "starlette": _starlette.__version__,
            "pydantic": _pydantic.__version__,
            "pydantic_core": _pydantic_core.__version__,
            "uvicorn": _uvicorn.__version__,
            "httpx": _httpx.__version__,
        },
        "torch_num_threads": thread_count,
        "torch_num_interop_threads": torch.get_num_interop_threads(),
    }

    blocking = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]
    verdicts = {k: v["verdict"] for k, v in results.items()}
    overall = "PASS" if all(verdicts[t] == "PASS" for t in blocking) else "FAIL"

    summary = {
        "b2_service": True,
        "scope": "B2-A only (Windows). B2-B (Linux/WSL) NOT attempted.",
        "verdict": overall,
        "per_test_verdict": verdicts,
        "started_utc": started,
        "finished_utc": finished,
        "app": "dev/sentiment-service/app.py",
        "verifier": "dev/sentiment-service/tools/verify_service.py",
        "b1_certified_modules_unchanged_by_b2a": certified,
        "b1_constraints_note": (
            "The service layer was installed into the `sentiment-model` env under "
            "dev/sentiment-service/b1-constraints.txt, which pins torch / "
            "transformers / tokenizers / numpy so the resolver cannot move them. "
            "Any future install into this env MUST go through that constraint "
            "file. Recording this here per the owner's instruction; "
            "requirements.txt is deliberately NOT edited to say so (supervisor's "
            "call)."
        ),
        "checkpoint": {
            "dir": str(CHECKPOINT_DIR),
            "sha256": sha256_file(str(CHECKPOINT_DIR / "model.safetensors")),
            "pinned_sha256": contract.CHECKPOINT_SHA256,
            "sha_match": sha256_file(str(CHECKPOINT_DIR / "model.safetensors"))
            == contract.CHECKPOINT_SHA256,
            "label_order": list(contract.LABEL_ORDER),
        },
        "reference_used_for_argmax_only": {
            "predictions_csv": str(VAL_PRED_CSV),
            "predictions_csv_sha256": sha256_file(str(VAL_PRED_CSV)),
            "texts_csv": str(DEV2_CSV),
            "texts_csv_sha256": sha256_file(str(DEV2_CSV)),
            "split_csv": str(SPLIT_CSV),
            "split_csv_sha256": sha256_file(str(SPLIT_CSV)),
        },
        "frozen_test_guards": guards,
        "t4_statistics": results["T4"],
        "tests": results,
        "environment": environment,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "b2_service_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    pd.DataFrame(
        [
            {
                "record_id": r["record_id"],
                "max_abs_prob_diff": r["max_abs_prob_diff"],
                "argmax_http": r["argmax_http"],
                "argmax_inprocess": r["argmax_inprocess"],
                "argmax_agree": r["argmax_agree"],
            }
            for r in consistency_rows
        ]
    ).to_csv(OUT_DIR / "b2_http_consistency.csv", index=False)

    # ---- raw console report -------------------------------------------
    print("=" * 72)
    print("B2-A SERVICE VERIFICATION — RAW OUTPUT")
    print("=" * 72)
    print(json.dumps(environment, indent=2))
    print("-" * 72)
    print("FROZEN-TEST GUARDS:", json.dumps(guards, indent=2))
    print("-" * 72)
    for tid in ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]:
        v = results[tid]
        print(f"{tid}: {v['verdict']}")
        print(json.dumps({k: val for k, val in v.items() if k != "rows"}, indent=2)[:4000])
        if "rows" in v:
            print(json.dumps(v["rows"], indent=2)[:6000])
        print("-" * 72)
    print(f"OVERALL: {overall}")
    print("=" * 72)
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
