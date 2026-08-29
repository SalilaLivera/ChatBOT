"""A4 — create and deploy the FER serving SPACE on Hugging Face.

Creates/updates    mykkularathne/maternalink-fer   (repo_type="space", gradio, PUBLIC)
Uploads ONLY the explicit allowlist below. Mirrors the A3 model-repo script's
approach: explicit manifest (never a glob, never a directory walk), a denylist as a
second barrier, and a SHA-256 gate on the model artifact that aborts before any
network transfer.

WHAT THIS IS
------------
The serving layer for the artifact A3 published to the model repo. The Space pulls
nothing at build time in this design — the float32 .tflite is uploaded directly and
loaded from ``models/`` by ``fer_service.inference.load_default``.

TWO LOAD-BEARING PINS (do not touch)
------------------------------------
  ai-edge-litert==2.2.0  — 1.2.0 cannot import on glibc >= 2.41; 2.2.0 runs with NO
                           TensorFlow and was measured numerically equal to tf.lite.
  Pillow==11.3.0         — measured bit-identical to the A1-certified 12.3.0 across
                           all 3,589 VAL images.
If the Space base image cannot satisfy either, that is an A4 BLOCKER — not something
to work around by loosening the constraint.

This script runs NO git command. It does not touch the A3 model repo.

Usage (from dev/fer-hf-model-repo, in the maternalink-fer-service env, hf auth done):
    python upload_space_to_hf.py --dry-run     # verify hashes + show plan, upload nothing
    python upload_space_to_hf.py --deploy      # create the Space PUBLIC and upload
    python upload_space_to_hf.py --verify-only # re-list an existing Space
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys

REPO_ID = "mykkularathne/maternalink-fer"
SPACE_SDK = "gradio"

HERE = os.path.dirname(os.path.abspath(__file__))
# dev/fer-hf-model-repo -> dev -> IT22638168
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SERVICE = os.path.join(REPO_ROOT, "dev", "fer-service")
MODELS = os.path.join(REPO_ROOT, "ml", "fer", "models")

FLOAT32_SHA256 = "47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c"

# ---------------------------------------------------------------------------
# EXPLICIT ALLOWLIST. Never a glob, never a directory walk.
#   (source path, path in repo, expected sha256 or None)
# ---------------------------------------------------------------------------
MANIFEST = [
    (os.path.join(SERVICE, "README.md"), "README.md", None),
    (os.path.join(SERVICE, "app.py"), "app.py", None),
    (os.path.join(SERVICE, "requirements.txt"), "requirements.txt", None),
    (os.path.join(SERVICE, "fer_service", "__init__.py"), "fer_service/__init__.py", None),
    (os.path.join(SERVICE, "fer_service", "contract.py"), "fer_service/contract.py", None),
    (os.path.join(SERVICE, "fer_service", "errors.py"), "fer_service/errors.py", None),
    (os.path.join(SERVICE, "fer_service", "preprocessing.py"), "fer_service/preprocessing.py", None),
    (os.path.join(SERVICE, "fer_service", "inference.py"), "fer_service/inference.py", None),
    (
        os.path.join(MODELS, "fer_mobilenetv2_96_float32.tflite"),
        "models/fer_mobilenetv2_96_float32.tflite",
        FLOAT32_SHA256,
    ),
]

# Nothing whose path contains these may ever be uploaded. Belt and braces on top
# of the allowlist. Second barrier per the A4 brief.
DENYLIST = (
    "fullint8",
    ".keras",
    "privatetest",
    "publictest",
    "splits_",
    ".ipynb",
    "run_",
    "data/raw",
    "data/processed",
    "float16",
    "dynint8",
)

# Files the Space is allowed to grow on its own (HF creates .gitattributes for LFS).
ALLOWED_EXTRA = {".gitattributes"}


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


def verify_readme_frontmatter():
    """Confirm the one permitted edit is in place and nothing else drifted."""
    path = os.path.join(SERVICE, "README.md")
    with open(path, "r", encoding="utf-8") as fh:
        head = fh.read(2000)
    if "sdk_version: 5.50.0" not in head:
        print("ABORTING — README.md frontmatter does not pin sdk_version: 5.50.0")
        sys.exit(1)
    if "sdk: gradio" not in head:
        print("ABORTING — README.md frontmatter is not sdk: gradio")
        sys.exit(1)
    print("README frontmatter: sdk: gradio, sdk_version: 5.50.0  OK")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--deploy", action="store_true")
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()

    print(f"space     : {REPO_ID}")
    print(f"sdk       : {SPACE_SDK}")
    print(f"visibility: PUBLIC")
    print()

    if not args.verify_only:
        verify_readme_frontmatter()
        print("\n--- manifest (allowlist only) ---")
        rows = check_manifest()
        for _src, dst, size, sha in rows:
            print(f"  {dst:<44} {size:>10,} B  {sha[:16]}...")
        print("\nall source files present; the model hash matches the pin.")
        assert not any("float16" in d or "dynint8" in d or "fullint8" in d
                       for _s, d, _z, _h in rows), "non-float32 tflite in manifest"
        assert not any(d.endswith(".keras") for _s, d, _z, _h in rows)
        assert not any(d.endswith(".ipynb") for _s, d, _z, _h in rows)
        print("confirmed: float32 only, no .keras, no notebook, no dataset file.")
        if args.dry_run:
            print("\nDRY RUN — nothing uploaded.")
            return 0

    if not (args.deploy or args.verify_only):
        print("\nneither --deploy nor --verify-only given; nothing to do.")
        return 0

    from huggingface_hub import HfApi

    api = HfApi()
    who = api.whoami()
    print(f"\nauthenticated as: {who.get('name')}")

    if args.deploy:
        api.create_repo(
            repo_id=REPO_ID,
            repo_type="space",
            space_sdk=SPACE_SDK,
            private=False,
            exist_ok=True,
        )
        print(f"space ready: https://huggingface.co/spaces/{REPO_ID}")
        for src, dst, size, _sha in rows:
            print(f"  uploading {dst} ({size:,} B) ...")
            api.upload_file(
                path_or_fileobj=src,
                path_in_repo=dst,
                repo_id=REPO_ID,
                repo_type="space",
                commit_message=f"A4: add {dst}",
            )
        print("upload complete.")

    print("\n--- space contents ---")
    files = sorted(api.list_repo_files(repo_id=REPO_ID, repo_type="space"))
    for f in files:
        print("  " + f)

    expected = {d for _s, d, _h in MANIFEST}
    unexpected = [
        f for f in files
        if f not in expected and f not in ALLOWED_EXTRA and not f.startswith(".")
    ]
    missing = [d for d in expected if d not in files]
    denyhits = [
        f for f in files for t in DENYLIST if t in f.lower()
    ]

    print()
    if missing:
        print("MISSING from space:", missing)
    if unexpected:
        print("UNEXPECTED in space:", unexpected)
    if denyhits:
        print("*** DENYLISTED FILE PRESENT:", denyhits)

    ok = not missing and not unexpected and not denyhits
    print("\nVERIFY:", "PASS — space contents match the manifest" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
