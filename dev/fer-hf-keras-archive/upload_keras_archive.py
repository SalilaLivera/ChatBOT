"""Back up the FER Keras training artifacts to a PRIVATE Hugging Face model repo.

Creates/updates   mykkularathne/maternalink-fer-keras-archive   (private=True)
Uploads ONLY the explicit three-file allowlist below + README.md.

This is the A3 procedure applied to the files A3 deliberately excluded: the .keras
sources. `fer_mobilenetv2_finetuned_96.keras` is the single source every deployed
.tflite was converted from; conversion is one-way. The FER test split is spent, so
none of this can be honestly regenerated. This is the ONLY off-machine copy.

Runs NO git command. Deletes NO local file.

Usage (after `hf auth login` in your own terminal):
    python upload_keras_archive.py --dry-run
    python upload_keras_archive.py
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys

REPO_ID = "mykkularathne/maternalink-fer-keras-archive"
REPO_TYPE = "model"

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(REPO_ROOT, "ml", "fer", "models")

# EXPLICIT ALLOWLIST — (source path, path in repo, expected sha256)
MANIFEST = [
    (
        os.path.join(MODELS, "fer_mobilenetv2_finetuned_96.keras"),
        "fer_mobilenetv2_finetuned_96.keras",
        "226467016084be4df6f38fe8e756233062f7d7a5cdc567e39d2788b6a02cdc2f",
    ),
    (
        os.path.join(MODELS, "fer_mobilenetv2_finetuned_96_calibrated.keras"),
        "fer_mobilenetv2_finetuned_96_calibrated.keras",
        "f6182a630a0e93c375354cad08bbb2baf3eb903d1da3b1ff7ef581e4f0bd993a",
    ),
    (
        os.path.join(MODELS, "fer_mobilenetv2_frozen_96.keras"),
        "fer_mobilenetv2_frozen_96.keras",
        "8275774ff51eb230430a0c5d59bdd91b7c9b5307827e301dc928522283058513",
    ),
    (os.path.join(HERE, "README.md"), "README.md", None),
]

DENYLIST = (
    ".tflite", "fullint8", "privatetest", "publictest", "splits_",
    ".ipynb", ".csv", ".npy", "run_", ".jpg", ".png",
)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def check_manifest():
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
            problems.append(f"SHA MISMATCH {dst}\n  expected {expected}\n  actual   {actual}")
        rows.append((src, dst, os.path.getsize(src), actual))
    if problems:
        print("\nABORTING — manifest problems:\n")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"repo      : {REPO_ID}")
    print("visibility: PRIVATE")
    print()

    rows = check_manifest()
    for _s, dst, size, sha in rows:
        print(f"  {dst:<48} {size:>10,} B  {sha[:16]}...")
    assert not any(d.endswith(".tflite") for _s, d, _z, _h in rows)
    assert not any(d.endswith(".ipynb") for _s, d, _z, _h in rows)
    print("\nall source files present; all pinned hashes match.")

    if args.dry_run:
        print("\nDRY RUN — nothing uploaded.")
        return 0

    from huggingface_hub import HfApi

    api = HfApi()
    try:
        who = api.whoami()
        print(f"\nauthenticated as: {who.get('name')}")
    except Exception as exc:  # noqa: BLE001
        print(f"\nNOT AUTHENTICATED (verbatim): {exc}")
        return 2

    info = api.create_repo(repo_id=REPO_ID, repo_type=REPO_TYPE, private=True, exist_ok=True)
    meta = api.repo_info(repo_id=REPO_ID, repo_type=REPO_TYPE)
    print(f"repo ready: https://huggingface.co/{REPO_ID}")
    print(f"create_repo returned: {info}")
    print(f"repo_info.private = {meta.private}")
    if meta.private is not True:
        print("\n*** REPO IS NOT PRIVATE — STOPPING. Do not attempt to fix by recreating. ***")
        return 3

    for src, dst, size, _sha in rows:
        print(f"  uploading {dst} ({size:,} B) ...")
        api.upload_file(
            path_or_fileobj=src, path_in_repo=dst,
            repo_id=REPO_ID, repo_type=REPO_TYPE,
            commit_message=f"archive: add {dst}",
        )
    print("upload complete.")

    # ---- verify against the Hub's OWN stored LFS sha256 ----
    print("\n--- stored-hash verification (Hub LFS metadata vs local) ---")
    meta = api.repo_info(repo_id=REPO_ID, repo_type=REPO_TYPE, files_metadata=True)
    stored = {s.rfilename: (s.lfs.get("sha256") if s.lfs else None) for s in meta.siblings}
    local = {dst: sha for _s, dst, _z, sha in rows}
    all_ok = True
    print(f"{'filename':<48} {'local sha256':<64} {'hub sha256':<64} MATCH")
    for dst, lh in local.items():
        if dst == "README.md":
            continue
        hh = stored.get(dst)
        ok = (hh == lh)
        all_ok &= ok
        print(f"{dst:<48} {lh:<64} {str(hh):<64} {'YES' if ok else 'NO'}")

    files = sorted(api.list_repo_files(repo_id=REPO_ID, repo_type=REPO_TYPE))
    print("\nrepo contents:", files)
    for f in files:
        for token in DENYLIST:
            if token in f.lower():
                print(f"  *** DENYLISTED FILE IN REPO: {f} ({token}) ***")
                all_ok = False

    print("\nRESULT:", "PASS — all three stored hashes match local" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
