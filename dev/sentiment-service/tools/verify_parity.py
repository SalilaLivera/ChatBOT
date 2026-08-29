"""B1 parity verification for the standalone sentiment inference package.

Measures whether sentiment_service reproduces the probabilities Experiment 02
recorded in validation_predictions.csv (Dev-v2 VALIDATION, 76 records).

ONE RUN, THEN REPORT. This script does not iterate toward a pass. It applies the
tolerances declared in SENTIMENT_B1_INFERENCE_PARITY_PLAN.md exactly as written.

FROZEN TEST IS CLOSED. Five guards (see plan section 4 / task):
  1. filter split membership to VALIDATION before any lookup; assert exactly 76
  2. assert every record_id appears in validation_predictions.csv
  3. open-time assertion before reading any data file (fail hard)
  4. denylist on every path before opening
  5. record count + SHA-256 of the exact sorted record_id list actually used

NO TEXT CONTENT IN ANY ARTIFACT. Record ids and numbers only.
"""

from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import tokenizers as _tokenizers
import transformers as _transformers

HERE = Path(__file__).resolve().parent
SERVICE_ROOT = HERE.parent                       # dev/sentiment-service
REPO = SERVICE_ROOT.parent.parent                # IT22638168
sys.path.insert(0, str(SERVICE_ROOT))

from sentiment_service import contract  # noqa: E402
from sentiment_service.inference import SentimentClassifier, sha256_file  # noqa: E402

SENTIMENT = REPO / "ml" / "sentiment"
DEV2_CSV = SENTIMENT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2.csv"
SPLIT_CSV = SENTIMENT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2_split_membership.csv"
VAL_PRED_CSV = SENTIMENT / "outputs" / "development_v2" / "experiment_02" / "validation_predictions.csv"
CHECKPOINT_DIR = SENTIMENT / "outputs" / "development_v2" / "experiment_02" / "best_checkpoint"
OUT_DIR = SENTIMENT / "outputs" / "b1_parity"

DENYLIST = ("PREGNANCY_FROZEN_TEST_SET", "frozen_test", "final_evaluation")

# Tolerances — declared before the run, not touched.
TOL = {
    "max_abs_prob_diff": {"expected": 1e-5, "hard_gate": 1e-4},
    "mean_abs_prob_diff": {"expected": 1e-6, "hard_gate": 1e-5},
    "argmax_agreement": {"required": 76},
}

LABEL_TO_IDX = {name: i for i, name in enumerate(contract.LABEL_ORDER)}


def guarded_open_read_csv(path: Path) -> pd.DataFrame:
    """Guard 3 + 4: denylist check and hard open-time assertion before any read."""
    p = str(path)
    lower = p.lower()
    for banned in DENYLIST:
        if banned.lower() in lower:
            raise SystemExit(f"GUARD TRIPPED (denylist): refusing to open {p}")
    if not path.is_file():
        raise SystemExit(f"GUARD TRIPPED (open-time): required input missing: {p}")
    return pd.read_csv(path)


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def main() -> None:
    started = datetime.now(timezone.utc).isoformat()
    guards = {}

    # ---- Guard 4 pre-check on every path we will touch --------------------
    for path in (DEV2_CSV, SPLIT_CSV, VAL_PRED_CSV, CHECKPOINT_DIR):
        low = str(path).lower()
        for banned in DENYLIST:
            if banned.lower() in low:
                raise SystemExit(f"GUARD TRIPPED (denylist, static): {path}")
    guards["denylist_checked_paths"] = [DEV2_CSV.name, SPLIT_CSV.name, VAL_PRED_CSV.name]

    # ---- Guard 1: filter split membership to VALIDATION, assert 76 --------
    split = guarded_open_read_csv(SPLIT_CSV)
    val_split = split[split["split"] == "validation"]
    n_val = len(val_split)
    assert n_val == 76, f"GUARD 1 FAILED: validation split has {n_val} rows, expected 76"
    guards["guard_1_validation_row_count"] = n_val
    val_ids = val_split["record_id"].tolist()

    # ---- Guard 2: every validation record_id appears in the reference ----
    ref = guarded_open_read_csv(VAL_PRED_CSV)
    ref_ids = set(ref["record_id"].astype(str))
    missing = [r for r in val_ids if r not in ref_ids]
    assert not missing, f"GUARD 2 FAILED: {len(missing)} validation ids not in reference: {missing[:5]}"
    assert len(ref) == 76, f"GUARD 2 FAILED: reference has {len(ref)} rows, expected 76"
    guards["guard_2_all_ids_in_reference"] = True

    # ---- Reconstruct `val` EXACTLY as notebook 04 did --------------------
    # val = development[development.record_id.isin(val_ids)]  -> dataset row order.
    development = guarded_open_read_csv(DEV2_CSV)
    assert set(development["language"]) == {"si"}, "dev-v2 not all Sinhala"
    val = development[development["record_id"].isin(set(val_ids))].copy()
    assert len(val) == 76, f"reconstructed val has {len(val)} rows"
    val_records = list(val["record_id"].astype(str))
    val_texts = [str(t) for t in val["text"].tolist()]

    # ---- Guard 5: count + SHA-256 of the exact sorted record_id list -----
    sorted_ids = sorted(val_records)
    ids_blob = "\n".join(sorted_ids) + "\n"
    ids_sha = sha256_text(ids_blob)
    guards["guard_5_record_count"] = len(sorted_ids)
    guards["guard_5_sorted_record_id_sha256"] = ids_sha
    guards["guard_5_sorted_record_id_sha256_no_trailing_newline"] = sha256_text("\n".join(sorted_ids))

    # ---- Reference lookup by record_id ----------------------------------
    ref_by_id = {
        str(row["record_id"]): (
            float(row["prob_calm"]), float(row["prob_neutral"]), float(row["prob_distressed"]),
            LABEL_TO_IDX[str(row["predicted_label"])],
        )
        for _, row in ref.iterrows()
    }

    # ---- Load the standalone package -----------------------------------
    clf = SentimentClassifier(str(CHECKPOINT_DIR), verify_sha256=True)
    checkpoint_sha = clf.checkpoint_sha256
    assert checkpoint_sha == contract.CHECKPOINT_SHA256, "checkpoint SHA mismatch"

    # ---- MODE A: batch-of-1 -------------------------------------------
    mode_a = [clf.predict_proba_batch([t], padding=True)[0] for t in val_texts]

    # ---- MODE B: batch_size=8, padding=True (reference batching) ------
    mode_b: list[list[float]] = []
    for start in range(0, len(val_texts), 8):
        chunk = val_texts[start:start + 8]
        mode_b.extend(clf.predict_proba_batch(chunk, padding=True))

    # ---- Compare -----------------------------------------------------
    def compare(computed: list[list[float]]) -> dict:
        all_abs = []
        rec = []
        argmax_ok = 0
        for rid, cvec in zip(val_records, computed):
            rcalm, rneu, rdis, rarg = ref_by_id[rid]
            rvec = (rcalm, rneu, rdis)
            diffs = [abs(cvec[i] - rvec[i]) for i in range(3)]
            all_abs.extend(diffs)
            carg = int(np.argmax(cvec))
            ok = carg == rarg
            argmax_ok += int(ok)
            rec.append({
                "record_id": rid,
                "record_max_abs_diff": max(diffs),
                "record_mean_abs_diff": sum(diffs) / 3.0,
                "ref_argmax": rarg,
                "computed_argmax": carg,
                "argmax_agree": ok,
            })
        arr = np.array(all_abs, dtype=np.float64)
        return {
            "n_records": len(computed),
            "n_prob_elements": int(arr.size),
            "max_abs_prob_diff": float(arr.max()),
            "mean_abs_prob_diff": float(arr.mean()),
            "argmax_agreement": argmax_ok,
            "argmax_total": len(computed),
            "per_record": rec,
        }

    stats_a = compare(mode_a)
    stats_b = compare(mode_b)

    # ---- Verdict ---------------------------------------------------
    def verdict_for(s: dict) -> str:
        if s["argmax_agreement"] != 76:
            return "FAIL"
        if s["max_abs_prob_diff"] > TOL["max_abs_prob_diff"]["hard_gate"]:
            return "FAIL"
        if s["mean_abs_prob_diff"] > TOL["mean_abs_prob_diff"]["hard_gate"]:
            return "FAIL"
        inside = (
            s["max_abs_prob_diff"] <= TOL["max_abs_prob_diff"]["expected"]
            and s["mean_abs_prob_diff"] <= TOL["mean_abs_prob_diff"]["expected"]
        )
        return "PASS" if inside else "PASS WITH INVESTIGATION"

    v_a = verdict_for(stats_a)
    v_b = verdict_for(stats_b)
    # Overall verdict: MODE A is what a service will do; it is the gating mode.
    # MODE B is the diagnostic. Overall FAIL if either fails a hard gate.
    if "FAIL" in (v_a, v_b):
        overall = "FAIL"
    elif v_a == "PASS" and v_b == "PASS":
        overall = "PASS"
    else:
        overall = "PASS WITH INVESTIGATION"

    finished = datetime.now(timezone.utc).isoformat()

    environment = {
        "sys_executable": sys.executable,
        "python_version": sys.version,
        "python_version_short": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "torch_version": torch.__version__,
        "transformers_version": _transformers.__version__,
        "tokenizers_version": _tokenizers.__version__,
        "numpy_version": np.__version__,
        "pandas_version": pd.__version__,
        "torch_num_threads": torch.get_num_threads(),
        "torch_num_interop_threads": torch.get_num_interop_threads(),
    }

    summary = {
        "b1_parity": True,
        "verdict": overall,
        "verdict_mode_a_batch_of_1": v_a,
        "verdict_mode_b_batch_of_8": v_b,
        "started_utc": started,
        "finished_utc": finished,
        "reference": {
            "predictions_csv": str(VAL_PRED_CSV),
            "predictions_csv_sha256": sha256_file(str(VAL_PRED_CSV)),
            "texts_csv": str(DEV2_CSV),
            "texts_csv_sha256": sha256_file(str(DEV2_CSV)),
            "split_csv": str(SPLIT_CSV),
            "split_csv_sha256": sha256_file(str(SPLIT_CSV)),
        },
        "checkpoint": {
            "dir": str(CHECKPOINT_DIR),
            "model_safetensors_sha256": checkpoint_sha,
            "pinned_sha256": contract.CHECKPOINT_SHA256,
            "sha_match": checkpoint_sha == contract.CHECKPOINT_SHA256,
            "label_order": list(contract.LABEL_ORDER),
        },
        "guards": guards,
        "tolerances_as_applied": TOL,
        "mode_a_batch_of_1": {k: v for k, v in stats_a.items() if k != "per_record"},
        "mode_b_batch_of_8": {k: v for k, v in stats_b.items() if k != "per_record"},
        "environment": environment,
        "predicted_magnitude_note": "plan predicted <= ~1e-5 max abs prob diff from float32 accumulation through 6 transformer layers",
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "b1_parity_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )

    per_record_rows = []
    a_by_id = {r["record_id"]: r for r in stats_a["per_record"]}
    b_by_id = {r["record_id"]: r for r in stats_b["per_record"]}
    for rid in val_records:
        a = a_by_id[rid]
        b = b_by_id[rid]
        per_record_rows.append({
            "record_id": rid,
            "mode_a_max_abs_diff": a["record_max_abs_diff"],
            "mode_a_mean_abs_diff": a["record_mean_abs_diff"],
            "mode_b_max_abs_diff": b["record_max_abs_diff"],
            "mode_b_mean_abs_diff": b["record_mean_abs_diff"],
            "ref_argmax": a["ref_argmax"],
            "mode_a_argmax": a["computed_argmax"],
            "mode_b_argmax": b["computed_argmax"],
            "mode_a_argmax_agree": a["argmax_agree"],
            "mode_b_argmax_agree": b["argmax_agree"],
        })
    pd.DataFrame(per_record_rows).to_csv(OUT_DIR / "b1_parity_per_record.csv", index=False)

    # ---- Raw console report ---------------------------------------
    print("=" * 70)
    print("B1 PARITY — RAW OUTPUT")
    print("=" * 70)
    print(json.dumps(environment, indent=2))
    print("-" * 70)
    print("GUARDS:", json.dumps(guards, indent=2))
    print("-" * 70)
    print(f"checkpoint sha256 : {checkpoint_sha}")
    print(f"pinned     sha256 : {contract.CHECKPOINT_SHA256}")
    print(f"sha match         : {checkpoint_sha == contract.CHECKPOINT_SHA256}")
    print("-" * 70)
    for name, s, v in (("MODE A (batch-of-1)", stats_a, v_a), ("MODE B (batch-of-8)", stats_b, v_b)):
        print(f"{name}")
        print(f"  records processed     : {s['n_records']}/76")
        print(f"  prob elements compared: {s['n_prob_elements']}")
        print(f"  max abs prob diff     : {s['max_abs_prob_diff']:.3e}")
        print(f"  mean abs prob diff    : {s['mean_abs_prob_diff']:.3e}")
        print(f"  argmax agreement      : {s['argmax_agreement']}/{s['argmax_total']}")
        print(f"  mode verdict          : {v}")
        print()
    print("-" * 70)
    print(f"OVERALL VERDICT: {overall}")
    print("=" * 70)


if __name__ == "__main__":
    main()
