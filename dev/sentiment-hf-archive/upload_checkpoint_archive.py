"""Back up the Experiment 02 SinBERT checkpoint to a PRIVATE Hugging Face model repo.

Creates/updates   mykkularathne/maternalink-sinbert-mood3-archive   (private=True)
Uploads ONLY the explicit four-file allowlist below + README.md.

This is the A3 / FER-Keras-archive procedure applied to the sentiment checkpoint.
`*.safetensors` is gitignored, so this checkpoint exists on ONE MACHINE WITH NO
BACKUP. The sentiment frozen test is spent, so the model CANNOT be honestly
retrained. Unlike the FER Keras backup (one self-contained file) this is a SET:
weights without tokenizer.json are a dead artifact. ALL FOUR or the backup FAILED.

Runs NO git command. Deletes NO local file.

Usage (after `hf auth login` in your own terminal):
    python upload_checkpoint_archive.py --dry-run
    python upload_checkpoint_archive.py
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys

REPO_ID = "mykkularathne/maternalink-sinbert-mood3-archive"
REPO_TYPE = "model"

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
CKPT = os.path.join(
    REPO_ROOT, "ml", "sentiment", "outputs", "development_v2",
    "experiment_02", "best_checkpoint",
)

# EXPLICIT ALLOWLIST — (source path, path in repo, expected sha256, expected bytes)
MANIFEST = [
    (
        os.path.join(CKPT, "model.safetensors"),
        "model.safetensors",
        "624da0651206746aa211a9fe472280a488effb75f4ef230f933d565688a965b9",
        266241260,
    ),
    (
        os.path.join(CKPT, "config.json"),
        "config.json",
        "7d29f307876bf2db8d3a003ad2649de63d88c9cbe38e3ea1dbb4db303ade0f27",
        972,
    ),
    (
        os.path.join(CKPT, "tokenizer.json"),
        "tokenizer.json",
        "15611347ac83a7a4b1d19760a4312d37d362eded82183442c1edd3cb0be2250a",
        2849982,
    ),
    (
        os.path.join(CKPT, "tokenizer_config.json"),
        "tokenizer_config.json",
        "7e1ed88dd146118dbb96050c36b388e868d3ca9d0e22f58539ba3606bac29e28",
        670,
    ),
    (os.path.join(HERE, "README.md"), "README.md", None, None),
]

DENYLIST = (
    "pregnancy_frozen_test_set", "frozen_test", "final_evaluation", ".csv",
    "dev_v2", "split_membership", "validation_predictions", ".ipynb",
)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def check_manifest():
    rows, problems = [], []
    for src, dst, expected, expbytes in MANIFEST:
        low = f"{src}/{dst}".replace("\\", "/").lower()
        for token in DENYLIST:
            if token in low:
                problems.append(f"DENYLIST '{token}' matched: {src} -> {dst}")
        if not os.path.isfile(src):
            problems.append(f"missing source: {src}")
            continue
        actual = sha256_file(src)
        size = os.path.getsize(src)
        if expected and actual != expected:
            problems.append(f"SHA MISMATCH {dst}\n  expected {expected}\n  actual   {actual}")
        if expbytes is not None and size != expbytes:
            problems.append(f"SIZE MISMATCH {dst}: expected {expbytes}, actual {size}")
        rows.append((src, dst, size, actual))
    if problems:
        print("\nABORTING — manifest problems:\n")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--small-only", action="store_true",
                    help="upload only config.json, tokenizer*.json, README.md "
                         "(model.safetensors handled separately when the network stalls)")
    ap.add_argument("--weights-only", action="store_true",
                    help="upload only model.safetensors")
    args = ap.parse_args()

    print(f"repo      : {REPO_ID}")
    print("visibility: PRIVATE")
    print()

    rows = check_manifest()
    for _s, dst, size, sha in rows:
        print(f"  {dst:<24} {size:>12,} B  {sha[:16]}...")
    assert len([r for r in rows if r[1] != "README.md"]) == 4, "expected exactly 4 checkpoint files"
    assert not any(d.endswith(".ipynb") for _s, d, _z, _h in rows)
    assert not any(d.endswith(".csv") for _s, d, _z, _h in rows)
    print("\nall four source files present; all pinned hashes + sizes match.")

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
        if args.small_only and dst == "model.safetensors":
            print(f"  SKIP {dst} (--small-only)")
            continue
        if args.weights_only and dst != "model.safetensors":
            print(f"  SKIP {dst} (--weights-only)")
            continue
        # denylist re-check immediately before every upload call
        low = f"{src}/{dst}".replace("\\", "/").lower()
        for token in DENYLIST:
            if token in low:
                print(f"*** DENYLIST '{token}' on {dst} at upload time — STOPPING ***")
                return 4
        print(f"  uploading {dst} ({size:,} B) ...")
        api.upload_file(
            path_or_fileobj=src, path_in_repo=dst,
            repo_id=REPO_ID, repo_type=REPO_TYPE,
            commit_message=f"archive: add {dst}",
        )
    print("upload complete.")

    files = sorted(api.list_repo_files(repo_id=REPO_ID, repo_type=REPO_TYPE))
    print("\nrepo contents:", files)
    need = {"model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json", "README.md"}
    missing = need - set(files)
    if missing and (args.small_only or args.weights_only):
        print(f"\nPARTIAL RUN — still missing {missing} (expected with the flag used)")
    elif missing:
        print(f"\n*** INCOMPLETE UPLOAD — missing {missing}. Backup FAILED. ***")
        return 5
    for f in files:
        for token in DENYLIST:
            if token in f.lower():
                print(f"  *** DENYLISTED FILE IN REPO: {f} ({token}) ***")
                return 6

    meta = api.repo_info(repo_id=REPO_ID, repo_type=REPO_TYPE)
    print(f"\nfinal repo_info.private = {meta.private}")
    print("RESULT:", "PASS — all five files present, repo private, no denylisted file")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
