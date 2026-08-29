#!/usr/bin/env python3
"""Fail-closed validator for a future MaternaLink annotation/development CSV.

Read-only: this script never repairs or rewrites the input. It loads frozen IDs
from the manifest only; it never loads frozen-test text or labels.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

PRIMARY = {"CALM", "NEUTRAL", "DISTRESSED"}
ADJUDICATED = PRIMARY | {"UNRESOLVED"}
FLAGS = {"yes", "no"}
TAGS = {
    "factual_information", "routine_question", "uncertainty_no_worry",
    "worry_anxiety", "fear", "sadness", "anger_frustration", "overwhelmed",
    "reassurance_relief", "positive_excitement", "stable_coping", "mixed_emotion",
    "context_missing", "code_mixed", "transliterated", "negation_or_sarcasm", "other",
}
REQUIRED = {
    "record_id", "dataset_version", "language", "text", "source_type",
    "domain_category", "annotator_1_label", "annotator_2_label",
    "annotator_1_ambiguity_flag", "annotator_2_ambiguity_flag",
    "annotator_1_tags", "annotator_2_tags", "agreement_status",
    "adjudicated_label", "ambiguity_flag_final", "selection_status",
}
# Accept the existing hyphenated IDs and the supplied source's underscore
# convention (for example, SI_NEW_V21_0001) without rewriting source IDs.
ID_RE = re.compile(r"^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)+$")


def normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).strip().split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def frozen_ids(manifest: Path) -> set[str]:
    # Manifest IDs are the only frozen artifact consumed by this validator.
    return {
        match.group(1)
        for match in re.finditer(r"(?m)^- ([A-Z0-9-]+)$", manifest.read_text(encoding="utf-8"))
    }


def parse_tags(value: str) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(";") if part.strip()]


def validate(path: Path, manifest: Path) -> int:
    errors: list[str] = []
    warnings: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED - columns
        if missing:
            errors.append(f"missing required columns: {sorted(missing)}")
        rows = list(reader)

    ids = [row.get("record_id", "") for row in rows]
    duplicate_ids = [key for key, count in Counter(ids).items() if key and count > 1]
    if duplicate_ids:
        errors.append(f"duplicate IDs: {duplicate_ids}")
    if any(not value for value in ids):
        errors.append("missing record_id")
    if any(not ID_RE.fullmatch(value) for value in ids if value):
        errors.append("invalid record_id format")

    raw_text_groups: defaultdict[str, list[str]] = defaultdict(list)
    normalized_groups: defaultdict[str, list[str]] = defaultdict(list)
    for row in rows:
        rid, text = row.get("record_id", ""), row.get("text", "")
        if not text.strip():
            errors.append(f"empty text: {rid}")
        raw_text_groups[text].append(rid)
        normalized_groups[normalized(text)].append(rid)
    raw_duplicates = [v for v in raw_text_groups.values() if len(v) > 1 and v[0]]
    norm_duplicates = [v for v in normalized_groups.values() if len(v) > 1 and v[0]]
    if raw_duplicates:
        errors.append(f"exact duplicate text groups: {raw_duplicates}")
    if norm_duplicates:
        errors.append(f"normalized duplicate text groups: {norm_duplicates}")

    for row in rows:
        rid = row.get("record_id", "")
        if row.get("language") not in {"si", "en", "SI", "EN"}:
            errors.append(f"invalid language for {rid}")
        if row.get("annotator_1_label") and row["annotator_1_label"] not in PRIMARY:
            errors.append(f"invalid annotator_1_label for {rid}")
        if row.get("annotator_2_label") and row["annotator_2_label"] not in PRIMARY:
            errors.append(f"invalid annotator_2_label for {rid}")
        if row.get("adjudicated_label") and row["adjudicated_label"] not in ADJUDICATED:
            errors.append(f"invalid adjudicated_label for {rid}")
        for field in ("annotator_1_ambiguity_flag", "annotator_2_ambiguity_flag", "ambiguity_flag_final"):
            if row.get(field) and row[field] not in FLAGS:
                errors.append(f"invalid {field} for {rid}")
        if row.get("agreement_status") not in {"", "pending", "agree", "disagree"}:
            errors.append(f"invalid agreement_status for {rid}")
        for field in ("annotator_1_tags", "annotator_2_tags"):
            values = parse_tags(row.get(field, ""))
            invalid = sorted(set(values) - TAGS)
            if invalid:
                errors.append(f"invalid tags in {field} for {rid}: {invalid}")
            if "," in row.get(field, ""):
                errors.append(f"tags must use semicolons, not commas, for {rid}")
        if row.get("annotator_1_label") and row.get("annotator_2_label"):
            expected = "agree" if row["annotator_1_label"] == row["annotator_2_label"] else "disagree"
            if row.get("agreement_status") not in {expected, ""}:
                errors.append(f"agreement_status inconsistent for {rid}")
        if row.get("adjudicated_label") == "UNRESOLVED":
            warnings.append(f"UNRESOLVED excluded from release: {rid}")

    frozen = frozen_ids(manifest)
    overlap = sorted(set(ids) & frozen)
    if overlap:
        errors.append(f"FROZEN-TEST ID OVERLAP — hard failure: {overlap}")

    print(f"DATASET: {path}")
    print(f"ROWS: {len(rows)}")
    print(f"SHA256: {sha256(path)}")
    print(f"DUPLICATE_IDS: {len(duplicate_ids)}")
    print(f"DUPLICATE_TEXT_GROUPS: {len(raw_duplicates)}")
    print(f"NORMALIZED_DUPLICATE_GROUPS: {len(norm_duplicates)}")
    print(f"FROZEN_OVERLAP: {len(overlap)}")
    for warning in warnings:
        print(f"WARNING: {warning}")
    if errors:
        print("RESULT: FAIL")
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("RESULT: PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--frozen-manifest", type=Path, required=True)
    args = parser.parse_args()
    return validate(args.dataset, args.frozen_manifest)


if __name__ == "__main__":
    sys.exit(main())
