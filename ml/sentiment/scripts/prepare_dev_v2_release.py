#!/usr/bin/env python3
"""Prepare normalized inputs and audit metadata for the existing Dev-v2 builder.

This is an input adapter, not a replacement builder. It never changes source
CSV files, frozen files, ground truth, or Experiment 01 artifacts.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(r"C:\Users\Yasindu\Desktop\Chat_Research\IT22638168\ml\sentiment")
SOURCE = Path(r"C:\Users\Yasindu\Desktop\maternalink_sinhala_demo_annotated_v1.csv")
GT = ROOT / "data/processed/PREGNANCY_ANNOTATION_GROUND_TRUTH.csv"
FROZEN_MANIFEST = ROOT / "data/processed/FROZEN_TEST_SET_MANIFEST.md"
EXPERIMENT_SPLIT = ROOT / "outputs/development/splits/development_split_membership.csv"
OUT = ROOT / "outputs/development_v2"
STAGING = OUT / "staging"

FIELDS = [
    "record_id", "dataset_version", "language", "text", "source_type",
    "domain_category", "annotator_1_label", "annotator_2_label",
    "annotator_1_ambiguity_flag", "annotator_2_ambiguity_flag",
    "annotator_1_tags", "annotator_2_tags", "agreement_status",
    "adjudicated_label", "ambiguity_flag_final", "selection_status",
    "source_origin", "source_record_id", "source_provenance",
]
PRIMARY = {"CALM", "NEUTRAL", "DISTRESSED"}


def norm(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).strip().split())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def frozen_ids() -> set[str]:
    return {m.group(1) for m in re.finditer(r"(?m)^- ([A-Z0-9-]+)$", FROZEN_MANIFEST.read_text(encoding="utf-8"))}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def agreement(a: str, b: str) -> str:
    return "agree" if a == b else "disagree"


def main() -> None:
    source = read_csv(SOURCE)
    required_source = {
        "candidate_id", "language", "text", "domain_category", "source_type",
        "adjudication_status", "guideline_version_for_future_annotation",
        "annotator_1_label", "annotator_2_label", "adjudicated_label",
    }
    missing_source = sorted(required_source - set(source[0]))
    if missing_source:
        raise SystemExit(f"source schema missing: {missing_source}")

    frozen = frozen_ids()
    gt = read_csv(GT)
    experiment_ids = {row["record_id"] for row in read_csv(EXPERIMENT_SPLIT)}
    gt_ids = {row["record_id"] for row in gt}
    gt_dev = [row for row in gt if row["record_id"] in experiment_ids]
    if len(gt_dev) != 90:
        raise SystemExit(f"expected 90 Experiment 01 development records, found {len(gt_dev)}")
    if set(experiment_ids) & frozen:
        raise SystemExit("Experiment 01 membership overlaps frozen IDs")

    source_ids = [row["candidate_id"] for row in source]
    source_norm = defaultdict(list)
    for row in source:
        source_norm[norm(row["text"])].append(row["candidate_id"])
    source_exact = Counter(row["text"] for row in source)
    unresolved = [row for row in source if row["adjudicated_label"] == "UNRESOLVED"]
    resolved = [row for row in source if row["adjudicated_label"] in PRIMARY]
    errors = {
        "source_duplicate_ids": len(source_ids) - len(set(source_ids)),
        "source_exact_duplicate_text_groups": sum(1 for n in source_exact.values() if n > 1),
        "source_normalized_duplicate_text_groups": sum(1 for n in source_norm.values() if len(n) > 1),
        "source_missing_values": {
            field: sum(1 for row in source if not str(row.get(field, "")).strip())
            for field in required_source
            if any(not str(row.get(field, "")).strip() for row in source)
        },
        "source_invalid_language": sum(row["language"] not in {"si", "SI"} for row in source),
        "source_invalid_annotator_labels": sum(
            row["annotator_1_label"] not in PRIMARY or row["annotator_2_label"] not in PRIMARY
            for row in source
        ),
        "source_invalid_adjudicated_labels": sum(row["adjudicated_label"] not in PRIMARY | {"UNRESOLVED"} for row in source),
    }
    source_gt_overlap = set(source_ids) & gt_ids
    source_frozen_overlap = set(source_ids) & frozen
    source_exp_overlap = set(source_ids) & experiment_ids
    gt_dev_text = {norm(row["text"]): row["record_id"] for row in gt_dev}
    new_vs_existing_text_overlap = sorted(
        (norm(row["text"]), row["candidate_id"], gt_dev_text[norm(row["text"])])
        for row in source if norm(row["text"]) in gt_dev_text
    )
    if errors["source_duplicate_ids"] or errors["source_exact_duplicate_text_groups"] or errors["source_normalized_duplicate_text_groups"]:
        raise SystemExit(f"source failed independence checks: {errors}")
    if source_gt_overlap or source_frozen_overlap or source_exp_overlap or new_vs_existing_text_overlap:
        raise SystemExit("source contamination detected")
    if errors["source_missing_values"] or errors["source_invalid_language"] or errors["source_invalid_annotator_labels"] or errors["source_invalid_adjudicated_labels"]:
        raise SystemExit(f"source failed schema/value checks: {errors}")

    def existing_row(row: dict[str, str]) -> dict[str, str]:
        a, b = row["human_label_annotator_1"], row["human_label_annotator_2"]
        flag = "yes" if row["ambiguity_flag"].upper() == "TRUE" else "no"
        return {
            "record_id": row["record_id"], "dataset_version": "historical_dev_v1",
            "language": "si", "text": row["text"],
            "source_type": "historical_ground_truth_development",
            "domain_category": "historical_existing_development",
            "annotator_1_label": a, "annotator_2_label": b,
            "annotator_1_ambiguity_flag": flag, "annotator_2_ambiguity_flag": flag,
            "annotator_1_tags": "", "annotator_2_tags": "",
            "agreement_status": agreement(a, b), "adjudicated_label": row["adjudicated_label"],
            "ambiguity_flag_final": flag, "selection_status": "existing_historical_development",
            "source_origin": "PREGNANCY_ANNOTATION_GROUND_TRUTH.csv",
            "source_record_id": row["record_id"],
            "source_provenance": "non-frozen Experiment 01 development membership",
        }

    def new_row(row: dict[str, str]) -> dict[str, str]:
        a, b = row["annotator_1_label"], row["annotator_2_label"]
        return {
            "record_id": row["candidate_id"], "dataset_version": "maternalink_sinhala_demo_annotated_v1",
            "language": "si", "text": row["text"], "source_type": row["source_type"],
            "domain_category": row["domain_category"], "annotator_1_label": a,
            "annotator_2_label": b, "annotator_1_ambiguity_flag": "no",
            "annotator_2_ambiguity_flag": "no", "annotator_1_tags": "",
            "annotator_2_tags": "", "agreement_status": agreement(a, b),
            "adjudicated_label": row["adjudicated_label"], "ambiguity_flag_final": "no",
            "selection_status": "new_resolved_candidate",
            "source_origin": SOURCE.name, "source_record_id": row["candidate_id"],
            "source_provenance": "supplied annotated development source; source metadata retained",
        }

    STAGING.mkdir(parents=True, exist_ok=True)
    existing_rows = [existing_row(row) for row in gt_dev]
    new_rows = [new_row(row) for row in resolved]
    for path, rows in ((STAGING / "existing_development_input.csv", existing_rows), (STAGING / "new_resolved_input.csv", new_rows)):
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    audit = {
        "source_file": str(SOURCE), "source_sha256": sha256(SOURCE), "source_rows": len(source),
        "source_language_counts": dict(Counter(row["language"] for row in source)),
        "source_label_counts": dict(Counter(row["adjudicated_label"] for row in source)),
        "resolved_new_rows": len(resolved), "unresolved_excluded_rows": len(unresolved),
        "unresolved_excluded_ids": sorted(row["candidate_id"] for row in unresolved),
        "existing_rows": len(existing_rows), "source_ground_truth_id_overlap": len(source_gt_overlap),
        "source_frozen_id_overlap": len(source_frozen_overlap), "source_experiment01_id_overlap": len(source_exp_overlap),
        "new_vs_existing_normalized_text_overlap": len(new_vs_existing_text_overlap),
        "validation_errors": errors,
        "note": "UNRESOLVED source rows are excluded without relabelling; frozen text/labels/predictions/metrics were not loaded.",
    }
    (OUT / "source_validation_and_contamination_report.json").write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(audit, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
