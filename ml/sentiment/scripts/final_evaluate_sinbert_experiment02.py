"""One-time frozen-test evaluation for the selected Experiment 02 checkpoint.

This script is deliberately fail-closed and isolated from the historical
evaluation scripts. It performs no training, tuning, threshold selection, or
dataset modification. It refuses to reuse an existing output directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from transformers import AutoModelForSequenceClassification, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
FROZEN_CSV = ROOT / "data" / "processed" / "PREGNANCY_FROZEN_TEST_SET.csv"
FROZEN_MANIFEST = ROOT / "data" / "processed" / "FROZEN_TEST_SET_MANIFEST.md"
EXP02_DIR = ROOT / "outputs" / "development_v2" / "experiment_02"
EXP02_METADATA = EXP02_DIR / "experiment_metadata.json"
CHECKPOINT = EXP02_DIR / "best_checkpoint"
DEV2_CSV = ROOT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2.csv"
DEV2_SPLIT = ROOT / "outputs" / "development_v2" / "release" / "maternalink_sinhala_dev_v2_split_membership.csv"

LABELS = ["CALM", "NEUTRAL", "DISTRESSED"]
EXPECTED_FROZEN_SHA256 = "d5ad1244d0c59b039d705a1876433b8493c7a36c92745e36fb429fa141b81f64"
EXPECTED_CHECKPOINT_SHA256 = "624DA0651206746AA211A9FE472280A488EFFB75F4EF230F933D565688A965B9"
EXPECTED_DEV2_SHA256 = "bdf2df52913eb686bacbfbb481764d4d425b61207ad4506c9d8ef325b7c9f5aa"
EXPECTED_SPLIT_SHA256 = "46b03fb9f4ecfeded82c7e4209767d567194250892fc4ac2efa93c7f74d2d81d"
EXPECTED_MODEL_REVISION = "7059f20a28a2b1e2ff2f45b13d6956435cdacb6a"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def manifest_ids(path: Path) -> set[str]:
    ids = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^- ([A-Za-z0-9_-]+)$", line.strip())
        if match:
            ids.add(match.group(1))
    return ids


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()

    require(not output_dir.exists(), f"Refusing to reuse existing output directory: {output_dir}")
    for path in [FROZEN_CSV, FROZEN_MANIFEST, EXP02_METADATA, CHECKPOINT / "config.json",
                 CHECKPOINT / "model.safetensors", CHECKPOINT / "tokenizer.json",
                 CHECKPOINT / "tokenizer_config.json", DEV2_CSV, DEV2_SPLIT]:
        require(path.is_file(), f"Required input missing: {path}")

    metadata = json.loads(EXP02_METADATA.read_text(encoding="utf-8"))
    require(metadata["status"] == "EXPERIMENT_02_DEVELOPMENT_ONLY", "Unexpected Experiment 02 status")
    require(metadata["model_revision"] == EXPECTED_MODEL_REVISION, "Unexpected model revision")
    require(metadata["dataset_sha256"] == EXPECTED_DEV2_SHA256, "Experiment 02 dataset hash mismatch")
    require(metadata["split_sha256"] == EXPECTED_SPLIT_SHA256, "Experiment 02 split hash mismatch")
    require(metadata["label_order"] == LABELS, "Experiment 02 label order mismatch")
    require(metadata["frozen_test_used"] is False, "Experiment 02 metadata reports frozen-test use")
    require(metadata["alternative_models_used"] is False, "Experiment 02 metadata reports alternative-model use")
    require(metadata["fer_fusion_used"] is False, "Experiment 02 metadata reports FER fusion")
    require(sha256(DEV2_CSV).lower() == EXPECTED_DEV2_SHA256, "Dev-v2 dataset hash mismatch")
    require(sha256(DEV2_SPLIT).lower() == EXPECTED_SPLIT_SHA256, "Dev-v2 split hash mismatch")

    checkpoint_hash = sha256(CHECKPOINT / "model.safetensors")
    require(checkpoint_hash.upper() == EXPECTED_CHECKPOINT_SHA256, "Experiment 02 checkpoint hash mismatch")
    config = json.loads((CHECKPOINT / "config.json").read_text(encoding="utf-8"))
    require(config["id2label"] == {"0": "CALM", "1": "NEUTRAL", "2": "DISTRESSED"}, "Checkpoint label map mismatch")
    require(config["architectures"] == ["RobertaForSequenceClassification"], "Checkpoint architecture mismatch")

    frozen_hash = sha256(FROZEN_CSV)
    require(frozen_hash.lower() == EXPECTED_FROZEN_SHA256, "Frozen-test CSV hash mismatch")
    frozen_manifest_hash = sha256(FROZEN_MANIFEST)
    frozen_ids = manifest_ids(FROZEN_MANIFEST)
    require(len(frozen_ids) == 120, f"Frozen manifest ID count mismatch: {len(frozen_ids)}")

    df = pd.read_csv(FROZEN_CSV)
    required_columns = {"record_id", "language", "text", "adjudicated_label"}
    require(required_columns.issubset(df.columns), "Frozen-test required columns missing")
    require(len(df) == 120, f"Frozen-test row count mismatch: {len(df)}")
    require(df["record_id"].is_unique, "Frozen-test record IDs are not unique")
    csv_ids = set(df["record_id"].astype(str))
    require(csv_ids == frozen_ids, "Frozen CSV IDs do not exactly match manifest IDs")
    require(set(df["adjudicated_label"]) == set(LABELS), "Frozen-test labels are outside the approved label space")

    tokenizer = AutoTokenizer.from_pretrained(str(CHECKPOINT), local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(str(CHECKPOINT), local_files_only=True)
    model.eval()
    model.to(torch.device("cpu"))

    probabilities = []
    predictions = []
    with torch.no_grad():
        for start in range(0, len(df), 8):
            texts = df.iloc[start:start + 8]["text"].astype(str).tolist()
            inputs = tokenizer(texts, return_tensors="pt", truncation=True, max_length=512,
                               padding=True)
            logits = model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)
            probabilities.extend(probs.cpu().tolist())
            predictions.extend(torch.argmax(probs, dim=-1).cpu().tolist())

    y_true = [LABELS.index(label) for label in df["adjudicated_label"]]
    y_pred = predictions
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=list(range(3)), zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=list(range(3)))
    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1.mean()),
        "weighted_f1": float((f1 * support).sum() / support.sum()),
        "per_class": {
            label: {"precision": float(precision[i]), "recall": float(recall[i]),
                    "f1": float(f1[i]), "support": int(support[i])}
            for i, label in enumerate(LABELS)
        },
        "confusion_matrix": cm.tolist(),
    }

    output_dir.mkdir(parents=True)
    prediction_rows = []
    for i, row in df.iterrows():
        prediction_rows.append({
            "record_id": str(row["record_id"]),
            "language": str(row["language"]),
            "true_label": str(row["adjudicated_label"]),
            "predicted_label": LABELS[predictions[i]],
            "predicted_label_id": int(predictions[i]),
            "prob_calm": probabilities[i][0],
            "prob_neutral": probabilities[i][1],
            "prob_distressed": probabilities[i][2],
        })
    pd.DataFrame(prediction_rows).to_csv(output_dir / "frozen_test_predictions.csv", index=False)
    pd.DataFrame(cm, index=LABELS, columns=LABELS).to_csv(output_dir / "confusion_matrix.csv")
    (output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

    run_metadata = {
        "status": "FINAL_ONE_TIME_FROZEN_TEST_EVALUATION_COMPLETED",
        "evaluation_timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "model_id": metadata["model_id"],
        "model_revision": EXPECTED_MODEL_REVISION,
        "checkpoint_path": str(CHECKPOINT),
        "checkpoint_model_safetensors_sha256": checkpoint_hash,
        "tokenizer_path": str(CHECKPOINT),
        "architecture": config["architectures"][0],
        "label_mapping": config["id2label"],
        "inference": {"max_length": 512, "truncation": True, "padding": "dynamic", "batch_size": 8,
                      "device": "cpu", "prediction_rule": "softmax then argmax", "threshold_tuning": False},
        "frozen_test_path": str(FROZEN_CSV),
        "frozen_test_sha256": frozen_hash,
        "frozen_manifest_path": str(FROZEN_MANIFEST),
        "frozen_manifest_sha256": frozen_manifest_hash,
        "frozen_record_count": 120,
        "frozen_ids_verified": True,
        "dev2_dataset_sha256": EXPECTED_DEV2_SHA256,
        "dev2_split_sha256": EXPECTED_SPLIT_SHA256,
        "training_or_tuning_performed": False,
        "dataset_modified": False,
        "checkpoint_modified": False,
    }
    (output_dir / "evaluation_metadata.json").write_text(json.dumps(run_metadata, indent=2) + "\n", encoding="utf-8")

    findings = f"""# Final One-Time Frozen-Test Evaluation — Experiment 02 SinBERT

Status: COMPLETED ONCE; frozen-test result is held-out final evaluation evidence.

The unchanged Experiment 02 best checkpoint was evaluated once against the unchanged 120-record frozen test. The frozen CSV hash and exact manifest ID set were verified before inference. No training, tuning, threshold selection, dataset modification, checkpoint modification, alternative model, or FER fusion was performed.

## Results

- Accuracy: {metrics['accuracy']:.6f}
- Macro-F1: {metrics['macro_f1']:.6f}
- Weighted-F1: {metrics['weighted_f1']:.6f}

## Per-class results

| Class | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
""" + "\n".join(
        f"| {label} | {metrics['per_class'][label]['precision']:.6f} | {metrics['per_class'][label]['recall']:.6f} | {metrics['per_class'][label]['f1']:.6f} | {metrics['per_class'][label]['support']} |"
        for label in LABELS
    ) + f"""

## Identity

- Model revision: `{EXPECTED_MODEL_REVISION}`
- Checkpoint SHA-256: `{checkpoint_hash}`
- Frozen-test SHA-256: `{frozen_hash}`
- Frozen manifest IDs verified: 120/120
- Label order: `CALM`, `NEUTRAL`, `DISTRESSED`
- Prediction rule: softmax followed by argmax

This result must not be used to retune or alter the model, dataset, thresholds, or fusion design.
"""
    (output_dir / "FINAL_EVALUATION_FINDINGS.md").write_text(findings, encoding="utf-8")


if __name__ == "__main__":
    main()
