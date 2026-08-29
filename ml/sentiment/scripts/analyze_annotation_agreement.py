#!/usr/bin/env python3
"""Read-only agreement analysis for two locked annotation columns."""
from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter
from pathlib import Path

LABELS = ("CALM", "NEUTRAL", "DISTRESSED")


def kappa(left: list[str], right: list[str]) -> float:
    n = len(left)
    observed = sum(a == b for a, b in zip(left, right)) / n if n else float("nan")
    a = Counter(left)
    b = Counter(right)
    expected = sum((a[label] / n) * (b[label] / n) for label in LABELS) if n else float("nan")
    return (observed - expected) / (1 - expected) if n and expected != 1 else float("nan")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("annotations", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    with args.annotations.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    required = {"record_id", "annotator_1_label", "annotator_2_label", "annotator_1_ambiguity_flag", "annotator_2_ambiguity_flag", "adjudicated_label"}
    missing = required - set(rows[0] if rows else [])
    if missing:
        raise SystemExit(f"FAIL: missing columns: {sorted(missing)}")
    valid = [row for row in rows if row["annotator_1_label"] in LABELS and row["annotator_2_label"] in LABELS]
    left = [row["annotator_1_label"] for row in valid]
    right = [row["annotator_2_label"] for row in valid]
    result = {
        "records_with_two_valid_labels": len(valid),
        "raw_agreement": sum(a == b for a, b in zip(left, right)) / len(valid) if valid else None,
        "cohens_kappa": kappa(left, right),
        "per_class": {},
        "disagreement_pairs": Counter(f"{a}->{b}" for a, b in zip(left, right) if a != b),
        "ambiguity_rate_annotator_1": sum(row["annotator_1_ambiguity_flag"] == "yes" for row in valid) / len(valid) if valid else None,
        "ambiguity_rate_annotator_2": sum(row["annotator_2_ambiguity_flag"] == "yes" for row in valid) / len(valid) if valid else None,
        "adjudication_rate": sum(bool(row.get("adjudicated_label")) for row in valid) / len(valid) if valid else None,
        "threshold_status": "SUPERVISOR / RESEARCH-TEAM DECISION REQUIRED",
    }
    for label in LABELS:
        total = sum(a == label for a in left)
        result["per_class"][label] = {
            "annotator_1_count": total,
            "agreement_count": sum(a == b == label for a, b in zip(left, right)),
            "agreement_rate_given_annotator_1": sum(a == b == label for a, b in zip(left, right)) / total if total else None,
        }
    result["disagreement_pairs"] = dict(result["disagreement_pairs"])
    if args.output:
        args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
