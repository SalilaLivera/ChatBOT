"""A3 — upload the FER model artifacts to a Hugging Face MODEL repository.

Creates/updates    mykkularathne/maternalink-fer-mobilenetv2
Uploads ONLY the explicit allowlist below. Verifies every file's SHA-256 before
upload and re-lists the repository afterwards.

WHY THIS MATTERS BEYOND DEPLOYMENT
----------------------------------
`ml/*/models/*` and `*.tflite` are gitignored project-wide, so these artifacts exist
on ONE machine with no backup — and the FER test split has already been used its one
permitted time, so the model cannot be honestly regenerated. This upload is the FIRST
durable off-machine copy of something irreplaceable.

DELIBERATELY NOT UPLOADED
-------------------------
  fullint8        REJECTED: -0.1188 macro-F1 (18x noise floor), ECE 0.1443, and LARGER
                  than dynint8. Strictly dominated. Publishing it invites misuse.
  *.keras         training artifacts; the calibrated one does not even reload
  FER-2013 images never
  manifests / notebooks / run metadata / outputs   not model artifacts

This script does NOT create a Space (that is A4) and runs NO git command.

Usage (from dev/fer-hf-model-repo, after `huggingface-cli login`):
    python upload_to_hf.py --dry-run      # verify hashes + show plan, upload nothing
    python upload_to_hf.py                # private repo (default)
    python upload_to_hf.py --public       # public repo
    python upload_to_hf.py --verify-only  # just re-list an existing repo
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys

REPO_ID = "mykkularathne/maternalink-fer-mobilenetv2"

HERE = os.path.dirname(os.path.abspath(__file__))
# dev/fer-hf-model-repo -> dev -> IT22638168
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(REPO_ROOT, "ml", "fer", "models")
OUTPUTS = os.path.join(REPO_ROOT, "ml", "fer", "outputs")

# ---------------------------------------------------------------------------
# EXPLICIT ALLOWLIST. Never a glob, never a directory walk.
#   (source path, path in repo, expected sha256 or None)
# Hashes are the values certified by A1/A2. A mismatch aborts the upload.
# ---------------------------------------------------------------------------
MANIFEST = [
    (
        os.path.join(MODELS, "fer_mobilenetv2_96_float32.tflite"),
        "fer_mobilenetv2_96_float32.tflite",
        "47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c",
    ),
    (
        os.path.join(MODELS, "fer_mobilenetv2_96_float16.tflite"),
        "fer_mobilenetv2_96_float16.tflite",
        "a83946afed5043953d03a00eb239c8cc3584fe9f28eed74ba7ac9456a79ca78d",
    ),
    (
        os.path.join(MODELS, "fer_mobilenetv2_96_dynint8.tflite"),
        "fer_mobilenetv2_96_dynint8.tflite",
        "3fbe843e46a59f879300715207a73fb912a1fb6ffe98984dc4c5ca55e2f4f2ec",
    ),
    (os.path.join(OUTPUTS, "nb07_tensor_spec.json"), "nb07_tensor_spec.json", None),
    (os.path.join(HERE, "README.md"), "README.md", None),
    (os.path.join(HERE, "LICENSE"), "LICENSE", None),
]

# Nothing whose path contains these may ever be uploaded. Belt and braces on top
# of the allowlist above.
DENYLIST = (
    "fullint8",
    ".keras",
    "privatetest",
    "publictest",
    "training_",
    "splits_",
    ".ipynb",
    "data/raw",
    "data/processed",
    "run_",
)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def check_manifest() -> list[tuple[str, str, int, str]]:
    """Validate every entry. Returns (src, dst, size, sha). Aborts on any problem."""
    rows, problems = [], []
    for src, dst, expected in MANIFEST:
        low = f"{src}/{dst}".replace("\\", "/").lower()
        for token in DENYLIST:
            if token in low:
                problems.append(f"DENYLIST '{token}' matched: {src} -> {dst}")
        if not os.path.isfile(src):
            problems.append(f"missing source: {src}")
            continue
        actual = sha256_file(src)
        if expected and actual != expected:
            problems.append(
                f"SHA MISMATCH {dst}\n    expected {expected}\n    actual   {actual}"
            )
        rows.append((src, dst, os.path.getsize(src), actual))

    if problems:
        print("\nABORTING — manifest problems:\n")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="verify only, upload nothing")
    ap.add_argument("--public", action="store_true", help="create the repo PUBLIC")
    ap.add_argument("--verify-only", action="store_true", help="re-list an existing repo")
    args = ap.parse_args()

    print(f"repo      : {REPO_ID}")
    print(f"visibility: {'PUBLIC' if args.public else 'PRIVATE'}")
    print()

    if not args.verify_only:
        print("--- manifest (allowlist only) ---")
        rows = check_manifest()
        for _src, dst, size, sha in rows:
            print(f"  {dst:<40} {size:>10,} B  {sha[:16]}...")
        print("\nall source files present; all pinned hashes match.")

        # Prove the rejected variant is not in the plan.
        assert not any("fullint8" in d for _s, d, _z, _h in rows), "fullint8 in manifest"
        assert not any(d.endswith(".keras") for _s, d, _z, _h in rows), ".keras in manifest"
        print("confirmed: no fullint8, no .keras, no dataset file in the manifest.")

        if args.dry_run:
            print("\nDRY RUN — nothing uploaded.")
            return 0

    try:
        from huggingface_hub import HfApi
    except ImportError:
        print("\nhuggingface_hub is not installed. Install it into the SERVICE env "
              "(never the training env):\n    pip install huggingface_hub")
        return 2

    api = HfApi()
    try:
        who = api.whoami()
        print(f"\nauthenticated as: {who.get('name')}")
    except Exception as exc:  # noqa: BLE001
        print(f"\nNOT AUTHENTICATED: {exc}\nRun:  huggingface-cli login")
        return 2

    if not args.verify_only:
        api.create_repo(
            repo_id=REPO_ID, repo_type="model",
            private=not args.public, exist_ok=True,
        )
        print(f"repo ready: https://huggingface.co/{REPO_ID}")

        for src, dst, size, _sha in rows:
            print(f"  uploading {dst} ({size:,} B) ...")
            api.upload_file(
                path_or_fileobj=src, path_in_repo=dst,
                repo_id=REPO_ID, repo_type="model",
                commit_message=f"A3: add {dst}",
            )
        print("upload complete.")

    # -- verify what is actually in the repo --------------------------------
    print("\n--- repository contents after upload ---")
    files = sorted(api.list_repo_files(repo_id=REPO_ID, repo_type="model"))
    for f in files:
        print("  " + f)

    expected = {d for _s, d, _z, _h in MANIFEST_ROWS_FALLBACK()}
    unexpected = [f for f in files if f not in expected and not f.startswith(".")]
    missing = [d for d in expected if d not in files]

    print()
    if missing:
        print("MISSING from repo:", missing)
    if unexpected:
        print("UNEXPECTED in repo:", unexpected)
    for f in files:
        low = f.lower()
        for token in DENYLIST:
            if token in low:
                print(f"  *** DENYLISTED FILE PRESENT IN REPO: {f} ({token}) ***")

    ok = not missing and not unexpected
    print("\nVERIFY:", "PASS — repo contents exactly match the manifest" if ok else "FAIL")
    return 0 if ok else 1


def MANIFEST_ROWS_FALLBACK():
    """Manifest entries as (src, dst, size, sha) without touching disk sizes."""
    return [(s, d, 0, h or "") for s, d, h in MANIFEST]


if __name__ == "__main__":
    raise SystemExit(main())
