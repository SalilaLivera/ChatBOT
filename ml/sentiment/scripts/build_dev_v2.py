#!/usr/bin/env python3
"""Fail-closed, opt-in builder for a future versioned Dev-v2 release.

This script is infrastructure only. It does not run on import and requires
explicit annotated input paths plus --confirm-approved-release.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

PRIMARY = {"CALM", "NEUTRAL", "DISTRESSED"}
REQUIRED = {"record_id", "language", "text", "adjudicated_label", "dataset_version", "source_type"}


def norm(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).strip().split())


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def frozen_ids(path: Path) -> set[str]:
    return {m.group(1) for m in re.finditer(r"(?m)^- ([A-Z0-9-]+)$", path.read_text(encoding="utf-8"))}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--new-annotated", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--frozen-manifest", type=Path, required=True)
    parser.add_argument("--dataset-version", required=True)
    parser.add_argument("--guideline-version", required=True)
    parser.add_argument("--allow-existing-development", type=Path)
    parser.add_argument("--confirm-approved-release", action="store_true")
    args = parser.parse_args()
    if not args.confirm_approved_release:
        raise SystemExit("FAIL CLOSED: pass --confirm-approved-release only after supervisor approval")
    paths = [args.new_annotated] + ([args.allow_existing_development] if args.allow_existing_development else [])
    rows: list[dict[str, str]] = []
    for path in paths:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            missing = REQUIRED - set(reader.fieldnames or [])
            if missing:
                raise SystemExit(f"FAIL: {path} missing {sorted(missing)}")
            rows.extend(reader)
    errors: list[str] = []
    ids = [row.get("record_id", "") for row in rows]
    if len(ids) != len(set(ids)):
        errors.append("duplicate IDs")
    frozen = frozen_ids(args.frozen_manifest)
    overlap = sorted(set(ids) & frozen)
    if overlap:
        errors.append(f"FROZEN — EXCLUDE overlap: {overlap}")
    if any(row.get("adjudicated_label") not in PRIMARY for row in rows):
        errors.append("all records must have final CALM/NEUTRAL/DISTRESSED adjudicated labels")
    raw: defaultdict[str, list[str]] = defaultdict(list)
    normalized: defaultdict[str, list[str]] = defaultdict(list)
    for row in rows:
        raw[row.get("text", "")].append(row.get("record_id", ""))
        normalized[norm(row.get("text", ""))].append(row.get("record_id", ""))
    if any(len(group) > 1 for group in raw.values()):
        errors.append("exact duplicate texts")
    if any(len(group) > 1 for group in normalized.values()):
        errors.append("normalized duplicate texts")
    if errors:
        raise SystemExit("FAIL CLOSED: " + "; ".join(errors))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    ordered = sorted(rows, key=lambda row: row["record_id"])
    output = args.output_dir / f"{args.dataset_version}.csv"
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(ordered[0]))
        writer.writeheader()
        writer.writerows(ordered)
    counts = Counter(row["adjudicated_label"] for row in ordered)
    manifest = {
        "dataset_version": args.dataset_version,
        "status": "FROZEN_RELEASE",
        "guideline_version": args.guideline_version,
        "source_files": [str(path) for path in paths],
        "record_count": len(ordered),
        "record_ids": [row["record_id"] for row in ordered],
        "label_counts": dict(counts),
        "frozen_overlap_count": 0,
        "dataset_sha256": digest(output),
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "near_duplicate_check": "NOT PERFORMED — supervisor/research-team method and threshold required",
        "raw_text_in_manifest": False,
    }
    (args.output_dir / f"{args.dataset_version}.manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (args.output_dir / f"{args.dataset_version}.class_counts.json").write_text(json.dumps(dict(counts), indent=2), encoding="utf-8")
    (args.output_dir / f"{args.dataset_version}.id_list.txt").write_text("\n".join(manifest["record_ids"]) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
