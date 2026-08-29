"""Verify the PRIVATE sentiment checkpoint archive — completeness, not just bytes.

STEP 1 — byte integrity. Download the stored bytes back into a TEMP dir and
re-hash locally (HF stores large files as Xet objects; there is no classic
lfs.sha256 to read). Report local vs downloaded side by side for all four files.

STEP 2 — the one that matters. Load the downloaded copy with
from_pretrained(<temp dir>, local_files_only=True) for BOTH tokenizer and model,
then run the B1 parity check against it: 76 Dev-v2 VALIDATION records, batch-of-1,
padding=True, vs experiment_02/validation_predictions.csv.

  EXPECTED:  max abs prob diff  4.470348358154297e-07
             argmax agreement   76/76

Reuses B1's five frozen-test guards verbatim. Does NOT open the frozen test.
Deletes the temp copy at the end. Runs NO git command.
"""

from __future__ import annotations

import hashlib
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent                                   # IT22638168
SERVICE_ROOT = REPO / "dev" / "sentiment-service"
sys.path.insert(0, str(SERVICE_ROOT))

from sentiment_service import contract                       # noqa: E402
from sentiment_service.inference import SentimentClassifier, sha256_file  # noqa: E402

REPO_ID = "mykkularathne/maternalink-sinbert-mood3-archive"
REPO_TYPE = "model"
ARCHIVE_FILES = ("model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json")

CKPT = REPO / "ml" / "sentiment" / "outputs" / "development_v2" / "experiment_02" / "best_checkpoint"
SENTIMENT = REPO / "ml" / "sentiment"
DEV2_CSV = SENTIMENT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2.csv"
SPLIT_CSV = SENTIMENT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2_split_membership.csv"
VAL_PRED_CSV = SENTIMENT / "outputs" / "development_v2" / "experiment_02" / "validation_predictions.csv"

DENYLIST = ("PREGNANCY_FROZEN_TEST_SET", "frozen_test", "final_evaluation")

LABEL_TO_IDX = {name: i for i, name in enumerate(contract.LABEL_ORDER)}

LOCAL_SHA = {
    "model.safetensors": "624da0651206746aa211a9fe472280a488effb75f4ef230f933d565688a965b9",
    "config.json": "7d29f307876bf2db8d3a003ad2649de63d88c9cbe38e3ea1dbb4db303ade0f27",
    "tokenizer.json": "15611347ac83a7a4b1d19760a4312d37d362eded82183442c1edd3cb0be2250a",
    "tokenizer_config.json": "7e1ed88dd146118dbb96050c36b388e868d3ca9d0e22f58539ba3606bac29e28",
}


def guarded_read_csv(path: Path):
    import pandas as pd
    lower = str(path).lower()
    for banned in DENYLIST:
        if banned.lower() in lower:
            raise SystemExit(f"GUARD TRIPPED (denylist): refusing to open {path}")
    if not path.is_file():
        raise SystemExit(f"GUARD TRIPPED (open-time): required input missing: {path}")
    return pd.read_csv(path)


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def main() -> int:
    from huggingface_hub import HfApi, hf_hub_download

    api = HfApi()
    info = api.repo_info(repo_id=REPO_ID, repo_type=REPO_TYPE)
    print(f"repo            : https://huggingface.co/{REPO_ID}")
    print(f"repo_info.private: {info.private}")
    if info.private is not True:
        print("*** REPO IS NOT PRIVATE — STOP AND REPORT. ***")
        return 3

    repo_files = sorted(api.list_repo_files(repo_id=REPO_ID, repo_type=REPO_TYPE))
    print(f"repo contents   : {repo_files}")
    for f in repo_files:
        for token in ("frozen_test", "final_evaluation", "dev_v2", "split_membership",
                      "validation_predictions", ".csv", ".ipynb"):
            if token in f.lower():
                print(f"*** DENYLISTED FILE IN REPO: {f} ({token}) — STOP ***")
                return 6

    tmp = Path(tempfile.mkdtemp(prefix="sinbert_archive_verify_"))
    try:
        # ---- STEP 1: download stored bytes, re-hash ---------------------------
        print("\n" + "=" * 70)
        print("STEP 1 — byte integrity (local sha256 vs downloaded sha256)")
        print("=" * 70)
        rows = []
        all_ok = True
        for name in ARCHIVE_FILES:
            p = hf_hub_download(repo_id=REPO_ID, repo_type=REPO_TYPE, filename=name,
                                local_dir=str(tmp))
            dl = sha256_file(p)
            local = LOCAL_SHA[name]
            src_local = sha256_file(str(CKPT / name))
            assert src_local == local, f"pin drift for {name}: {src_local}"
            ok = dl == local
            all_ok &= ok
            rows.append((name, Path(p).stat().st_size, local, dl, ok))
        w = max(len(n) for n in ARCHIVE_FILES)
        print(f"{'file':<{w}}  {'bytes':>12}  {'local sha256':<64}  {'downloaded sha256':<64}  MATCH")
        for n, b, l, d, ok in rows:
            print(f"{n:<{w}}  {b:>12,}  {l:<64}  {d:<64}  {'YES' if ok else 'NO'}")
        print(f"\nSTEP 1 RESULT: {'PASS' if all_ok else 'FAIL'}")
        if not all_ok:
            return 1

        # ---- STEP 2: load downloaded copy + B1 parity -----------------------
        print("\n" + "=" * 70)
        print("STEP 2 — load temp copy, reproduce B1 parity")
        print("=" * 70)

        guards = {}
        for path in (DEV2_CSV, SPLIT_CSV, VAL_PRED_CSV):
            for banned in DENYLIST:
                if banned.lower() in str(path).lower():
                    raise SystemExit(f"GUARD TRIPPED (denylist, static): {path}")

        # Guard 1: filter split membership to VALIDATION, assert 76
        split = guarded_read_csv(SPLIT_CSV)
        val_split = split[split["split"] == "validation"]
        assert len(val_split) == 76, f"GUARD 1 FAILED: {len(val_split)} validation rows, expected 76"
        guards["guard_1_validation_row_count"] = int(len(val_split))
        val_ids = val_split["record_id"].tolist()

        # Guard 2: every validation record_id appears in the reference
        ref = guarded_read_csv(VAL_PRED_CSV)
        ref_ids = set(ref["record_id"].astype(str))
        missing = [r for r in val_ids if r not in ref_ids]
        assert not missing, f"GUARD 2 FAILED: {len(missing)} ids not in reference: {missing[:5]}"
        assert len(ref) == 76, f"GUARD 2 FAILED: reference has {len(ref)} rows"
        guards["guard_2_all_ids_in_reference"] = True

        # Reconstruct `val` exactly as notebook 04 did (dataset row order)
        development = guarded_read_csv(DEV2_CSV)
        assert set(development["language"]) == {"si"}, "dev-v2 not all Sinhala"
        val = development[development["record_id"].isin(set(val_ids))].copy()
        assert len(val) == 76, f"reconstructed val has {len(val)} rows"
        val_records = list(val["record_id"].astype(str))
        val_texts = [str(t) for t in val["text"].tolist()]

        # Guard 5: count + SHA-256 of the exact sorted record_id list
        sorted_ids = sorted(val_records)
        guards["guard_5_record_count"] = len(sorted_ids)
        guards["guard_5_sorted_record_id_sha256"] = sha256_text("\n".join(sorted_ids) + "\n")

        ref_by_id = {
            str(row["record_id"]): (
                float(row["prob_calm"]), float(row["prob_neutral"]), float(row["prob_distressed"]),
                LABEL_TO_IDX[str(row["predicted_label"])],
            )
            for _, row in ref.iterrows()
        }

        # Guards 3 + 4: denylist + open-time assertion happen inside SentimentClassifier's
        # dir checks; the temp dir path is checked here too.
        for banned in DENYLIST:
            if banned.lower() in str(tmp).lower():
                raise SystemExit("GUARD TRIPPED: temp dir path denylisted")

        # Load the DOWNLOADED copy — from_pretrained(tmp, local_files_only=True) for both.
        clf = SentimentClassifier(str(tmp), verify_sha256=True)
        assert clf.checkpoint_sha256 == contract.CHECKPOINT_SHA256, "temp-copy checkpoint SHA mismatch"
        print(f"loaded from temp dir: {tmp}")
        print(f"temp-copy checkpoint sha256: {clf.checkpoint_sha256}")
        print(f"GUARDS: {guards}")

        # MODE A: batch-of-1, padding=True
        mode_a = [clf.predict_proba_batch([t], padding=True)[0] for t in val_texts]

        all_abs = []
        argmax_ok = 0
        for rid, cvec in zip(val_records, mode_a):
            rcalm, rneu, rdis, rarg = ref_by_id[rid]
            diffs = [abs(cvec[i] - (rcalm, rneu, rdis)[i]) for i in range(3)]
            all_abs.extend(diffs)
            argmax_ok += int(int(np.argmax(cvec)) == rarg)
        arr = np.array(all_abs, dtype=np.float64)
        max_abs = float(arr.max())
        mean_abs = float(arr.mean())

        print(f"\nrecords processed  : {len(mode_a)}/76")
        print(f"max abs prob diff  : {max_abs!r}")
        print(f"mean abs prob diff : {mean_abs!r}")
        print(f"argmax agreement   : {argmax_ok}/76")

        EXP_MAX = 4.470348358154297e-07
        ok2 = (argmax_ok == 76) and (max_abs <= 1e-4) and (abs(max_abs - EXP_MAX) <= 1e-9)
        print(f"\nexpected max abs   : {EXP_MAX!r}")
        print(f"STEP 2 RESULT: {'PASS' if ok2 else 'FAIL'}")
        return 0 if ok2 else 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"\ntemp copy deleted: {tmp} (exists: {tmp.exists()})")


if __name__ == "__main__":
    raise SystemExit(main())
