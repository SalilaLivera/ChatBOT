"""A2 follow-up — Pillow version equivalence check. NOT an A1 re-run.

WHY THIS EXISTS
---------------
A1 certified ``fer_service.preprocessing.preprocess()`` bit-identical to the
notebook-07 TensorFlow reference while running on **Pillow 12.3.0**.
A2 verified the HTTP layer while running on **Pillow 11.3.0**.
Nobody has verified those two Pillow builds produce the same tensors — and
``requirements.txt`` pins ``Pillow>=10.2,<12``, which excludes 12.3.0 entirely.

This script runs the REAL ``preprocess()`` over the SAME FER-2013 VALIDATION
images in whatever env it is launched in, and writes per-image SHA-256 of the
returned float32 tensor. Run it once per env, then ``--compare`` the two CSVs.

NO TensorFlow. This does not load the TFLite model. It measures ONLY whether
two Pillow builds put out the same preprocessing tensors.

PASS : all 3,589 tensor hashes identical between the two envs.
FAIL : any hash differs. No tolerance — this is a bit-identity question.

USAGE (WSL, from dev/fer-service)
---------------------------------
  # env A — Pillow 12.3.0 (what A1 certified)
  python tools/check_pillow_equivalence.py run --tag gpu \\
      --images-root ~/fer/data/raw \\
      --manifest ../../ml/fer/outputs/splits_cleaned.csv \\
      --out-dir  ../../ml/fer/outputs/a2_service

  # env B — Pillow 11.3.0 (what the service ships)
  python tools/check_pillow_equivalence.py run --tag service  ...same...

  # compare (numpy only, either env)
  python tools/check_pillow_equivalence.py compare \\
      --gpu-csv     ../../ml/fer/outputs/a2_service/pillow_equiv_gpu.csv \\
      --service-csv ../../ml/fer/outputs/a2_service/pillow_equiv_service.csv \\
      --gpu-npy     ../../ml/fer/outputs/a2_service/pillow_equiv_gpu_first200.npy \\
      --service-npy ../../ml/fer/outputs/a2_service/pillow_equiv_service_first200.npy \\
      --out-dir     ../../ml/fer/outputs/a2_service
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import platform
import sys
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

VAL_PREFIX = "PublicTest_"
EXPECTED_VAL_COUNT = 3589
FIRST_N = 200

# Guard: nothing matching these tokens may ever be opened.
DENYLIST_SUBSTRINGS = ("privatetest", "private_test")


def _load_preprocess():
    """Return the SHIPPED preprocess(). Try the package first (its __init__ does
    not load a TFLite runtime at import time); fall back to loading the module
    file directly if the package import fails for any reason."""
    try:
        from fer_service.preprocessing import preprocess  # noqa: E402
        return preprocess, "fer_service.preprocessing"
    except Exception as exc:  # noqa: BLE001
        print(f"package import failed ({exc!r}); loading preprocessing.py directly")
        import importlib.util

        pkg_dir = os.path.join(HERE, "..", "fer_service")
        # make relative imports (`from .contract import ...`) resolve
        import types

        pkg = types.ModuleType("fer_service")
        pkg.__path__ = [os.path.abspath(pkg_dir)]
        sys.modules.setdefault("fer_service", pkg)
        spec = importlib.util.spec_from_file_location(
            "fer_service.preprocessing", os.path.join(pkg_dir, "preprocessing.py")
        )
        mod = importlib.util.module_from_spec(spec)
        sys.modules["fer_service.preprocessing"] = mod
        spec.loader.exec_module(mod)
        return mod.preprocess, "fer_service/preprocessing.py (direct)"


def _tensor_sha256(t: np.ndarray) -> str:
    return hashlib.sha256(
        np.ascontiguousarray(t, dtype=np.float32).tobytes()
    ).hexdigest()


def _check_denylist(path: str) -> None:
    low = str(path).lower()
    for tok in DENYLIST_SUBSTRINGS:
        if tok in low:
            raise RuntimeError(f"denylisted token {tok!r} in path {path!r}")


def _build_env(preprocess_source: str) -> dict:
    import PIL
    import PIL.features

    env = {
        "sys_executable": sys.executable,
        "python": sys.version,
        "platform": platform.platform(),
        "numpy": np.__version__,
        "pillow": PIL.__version__,
        "preprocess_source": preprocess_source,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    for key, feat in (
        ("pillow_jpeg_library_version", "jpg"),
        ("pillow_zlib_version", "zlib"),
        ("pillow_libtiff_version", "libtiff"),
    ):
        try:
            env[key] = PIL.features.version(feat)
        except Exception:  # noqa: BLE001
            env[key] = None
    try:
        env["pillow_libjpeg_turbo"] = bool(
            PIL.features.check_feature("libjpeg_turbo")
        )
    except Exception:  # noqa: BLE001
        env["pillow_libjpeg_turbo"] = None
    return env


def _load_val(manifest_path: str, images_root: str):
    import pandas as pd

    man = pd.read_csv(manifest_path)
    for col in ("file_path", "split_group", "class"):
        if col not in man.columns:
            raise RuntimeError(f"manifest lacks column {col!r}: {list(man.columns)}")

    # Filter to VAL FIRST — TEST rows never enter the process.
    val = man[man["split_group"] == "VAL"].reset_index(drop=True).copy()
    assert len(val) == EXPECTED_VAL_COUNT, (
        f"VAL rows = {len(val)}, expected exactly {EXPECTED_VAL_COUNT}"
    )

    val["basename"] = val["file_path"].map(
        lambda p: os.path.basename(str(p).replace("\\", "/"))
    )

    bad = val.loc[~val["basename"].str.startswith(VAL_PREFIX), "basename"].tolist()
    assert not bad, f"{len(bad)} VAL basenames not starting {VAL_PREFIX!r}: {bad[:5]}"
    assert not val["basename"].str.contains("PrivateTest_").any(), (
        "PrivateTest_ basename present in the VAL filter result"
    )
    assert val["basename"].is_unique, "duplicate VAL basenames"

    # Rebuild paths from images_root + split dir + class + basename. Do NOT
    # consume the manifest's stored backslash relative paths. All VAL images are
    # PublicTest_ and live under test/ on disk.
    val["abs_path"] = [
        os.path.join(images_root, "test", str(c), b)
        for c, b in zip(val["class"], val["basename"])
    ]

    # SORTED basename order — must be identical in both envs.
    val = val.sort_values("basename").reset_index(drop=True)
    return val


def cmd_run(args) -> int:
    from PIL import Image

    preprocess, preprocess_source = _load_preprocess()
    env = _build_env(preprocess_source)
    print(json.dumps(env, indent=2))

    if not os.path.isdir(args.images_root):
        raise RuntimeError(f"--images-root not a directory: {args.images_root}")
    if not os.path.isfile(args.manifest):
        raise RuntimeError(f"--manifest not found: {args.manifest}")

    val = _load_val(args.manifest, args.images_root)
    print(f"VAL rows after filter+sort : {len(val)}")
    print(f"first basename : {val['basename'].iloc[0]}")
    print(f"last  basename : {val['basename'].iloc[-1]}")

    os.makedirs(args.out_dir, exist_ok=True)
    csv_path = os.path.join(args.out_dir, f"pillow_equiv_{args.tag}.csv")
    npy_path = os.path.join(args.out_dir, f"pillow_equiv_{args.tag}_first200.npy")
    env_path = os.path.join(args.out_dir, f"pillow_equiv_{args.tag}_env.json")

    rows = []
    first_tensors = []
    for i, r in enumerate(val.itertuples(index=False, name="Row")):
        base = r.basename
        path = r.abs_path

        # Open-time assertion — fail hard, never skip-and-continue.
        assert "PrivateTest_" not in base, f"PrivateTest_ reached open: {base!r}"
        assert base.startswith(VAL_PREFIX), f"non-VAL basename at open: {base!r}"
        _check_denylist(path)

        if not os.path.isfile(path):
            raise RuntimeError(f"missing image file: {path}")

        with Image.open(path) as im:
            im.load()
            t = preprocess(im)

        if t.shape != (1, 96, 96, 3) or t.dtype != np.float32:
            raise RuntimeError(f"{base}: bad tensor {t.shape} {t.dtype}")

        rows.append((base, _tensor_sha256(t)))
        if i < FIRST_N:
            first_tensors.append(np.ascontiguousarray(t[0], dtype=np.float32))

        if (i + 1) % 500 == 0:
            print(f"  {i + 1}/{len(val)}")

    assert len(rows) == EXPECTED_VAL_COUNT, f"hashed {len(rows)} rows"

    with open(csv_path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["basename", "tensor_sha256"])
        w.writerows(rows)
    print(f"wrote {csv_path}  ({len(rows)} rows)")

    stack = np.stack(first_tensors, axis=0)  # (200, 96, 96, 3)
    np.save(npy_path, stack)
    print(f"wrote {npy_path}  {stack.shape} {stack.dtype} "
          f"({stack.nbytes / 1e6:.1f} MB)")

    with open(env_path, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "tag": args.tag,
                "environment": env,
                "n_hashed": len(rows),
                "first_n_npy": FIRST_N,
                "csv": os.path.abspath(csv_path),
                "npy": os.path.abspath(npy_path),
                "manifest_sha256": _sha256_file(args.manifest),
                "images_root": args.images_root,
                "sorted_order": True,
                "first_basename": rows[0][0],
                "last_basename": rows[-1][0],
            },
            fh,
            indent=2,
        )
        fh.write("\n")
    print(f"wrote {env_path}")
    return 0


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_hash_csv(path: str):
    out = {}
    with open(path, encoding="utf-8", newline="") as fh:
        rd = csv.reader(fh)
        header = next(rd)
        assert header == ["basename", "tensor_sha256"], f"bad header {header}"
        for base, digest in rd:
            out[base] = digest
    return out


def cmd_compare(args) -> int:
    gpu = _read_hash_csv(args.gpu_csv)
    svc = _read_hash_csv(args.service_csv)

    assert len(gpu) == EXPECTED_VAL_COUNT, f"gpu csv has {len(gpu)} rows"
    assert len(svc) == EXPECTED_VAL_COUNT, f"service csv has {len(svc)} rows"
    assert set(gpu) == set(svc), "basename sets differ between the two CSVs"

    bases = sorted(gpu)
    mismatches = [b for b in bases for _ in (0,) if gpu[b] != svc[b]]
    n_mis = len(mismatches)

    report = {
        "verdict": "PASS" if n_mis == 0 else "FAIL",
        "check": "Pillow-version tensor equivalence (NOT an A1 re-run)",
        "n_images": EXPECTED_VAL_COUNT,
        "n_hash_mismatches": n_mis,
        "pass_definition": "all 3589 tensor SHA-256 identical between envs",
        "gpu_env": _load_env_sidecar(args.gpu_csv),
        "service_env": _load_env_sidecar(args.service_csv),
        "gpu_csv_sha256": _sha256_file(args.gpu_csv),
        "service_csv_sha256": _sha256_file(args.service_csv),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }

    if n_mis:
        report["mismatching_basenames_first_50"] = mismatches[:50]
        report["mismatching_basenames_count"] = n_mis
        # Quantify from the first-200 .npy files where possible.
        g = np.load(args.gpu_npy)
        s = np.load(args.service_npy)
        assert g.shape == s.shape, f"npy shapes differ {g.shape} {s.shape}"
        first200 = bases[:FIRST_N]
        diff = np.abs(g.astype(np.float64) - s.astype(np.float64))
        per_img_max = diff.reshape(diff.shape[0], -1).max(axis=1)
        n_diff_200 = int((per_img_max > 0).sum())
        report["first200_subset"] = {
            "n_of_200_that_differ": n_diff_200,
            "max_abs_tensor_diff": float(diff.max()),
            "mean_abs_tensor_diff": float(diff.mean()),
            "mismatching_basenames_in_200": [
                b for b in first200 if gpu[b] != svc[b]
            ][:50],
        }

    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(args.out_dir, "pillow_equiv_report.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(json.dumps(report, indent=2, sort_keys=True))
    print(f"\nwrote {out_path}")
    print(f"\nVERDICT: {report['verdict']}  ({n_mis} mismatches / {EXPECTED_VAL_COUNT})")
    return 0 if n_mis == 0 else 1


def _load_env_sidecar(csv_path: str):
    """The env json sits next to the csv as pillow_equiv_<tag>_env.json."""
    d = os.path.dirname(os.path.abspath(csv_path))
    base = os.path.basename(csv_path)
    tag = base[len("pillow_equiv_"):-len(".csv")]
    p = os.path.join(d, f"pillow_equiv_{tag}_env.json")
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    return {"note": f"env sidecar not found: {p}"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="hash tensors in the current env")
    r.add_argument("--tag", required=True, help="e.g. gpu or service")
    r.add_argument("--images-root", required=True)
    r.add_argument("--manifest", required=True)
    r.add_argument("--out-dir", required=True)
    r.set_defaults(func=cmd_run)

    c = sub.add_parser("compare", help="compare two hash CSVs")
    c.add_argument("--gpu-csv", required=True)
    c.add_argument("--service-csv", required=True)
    c.add_argument("--gpu-npy", required=True)
    c.add_argument("--service-npy", required=True)
    c.add_argument("--out-dir", required=True)
    c.set_defaults(func=cmd_compare)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
