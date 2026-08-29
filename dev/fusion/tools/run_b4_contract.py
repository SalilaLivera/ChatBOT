"""Run F1-F13 and emit the B4 contract artifacts.

    python dev/fusion/tools/run_b4_contract.py

Writes to  ml/fusion/outputs/b4_contract/ :
    b4_contract_conformance.json   per-test verdict + spec clause
    b4_weight_sensitivity.csv      F13 sweep
    plots/b4_weight_sensitivity.png F13 sweep, state vs W_face

EVERY artifact carries, verbatim, the placeholder-parameter disclaimer.
This script computes NO accuracy, macro-F1, or confusion matrix for fusion —
none can exist without a joint dataset, which does not.
"""

from __future__ import annotations

import csv
import datetime as _dt
import json
import sys
import traceback
from pathlib import Path

_HERE = Path(__file__).resolve()
_TESTS = _HERE.parents[1] / "tests"
_PKG_ROOT = _HERE.parents[1]
for _p in (str(_PKG_ROOT), str(_TESTS)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import b4_checks  # noqa: E402

REPO_ROOT = _HERE.parents[3]
OUT_DIR = REPO_ROOT / "ml" / "fusion" / "outputs" / "b4_contract"
PLOTS_DIR = OUT_DIR / "plots"

DISCLAIMER = (
    "The fusion parameters used here are PLACEHOLDERS FOR TESTING, not measured "
    "values. W_face, W_text and all thresholds remain [FUTURE-EXPERIMENTAL] "
    "pending the Phase 7 experiment."
)

NOT_VALIDATED = (
    "Fusion was NOT validated. No dataset pairs a face image and a Sinhala "
    "message from the same person at the same moment with a ground-truth mood "
    "label, so no accuracy, macro-F1, or confusion matrix for fusion exists or "
    "is reported. F13 is a weight-sensitivity sweep on SYNTHETIC evidence, not "
    "a validation."
)


def _run_checks() -> list[dict]:
    verdicts = []
    for fid, desc, fn in b4_checks.CHECKS:
        entry = {"id": fid, "description": desc}
        try:
            res = fn()
            entry["verdict"] = "PASS"
            entry["spec_clause"] = res["spec_clause"]
            entry["evidence"] = res.get("detail", [])
        except Exception:  # noqa: BLE001 - we want the traceback in the artifact
            entry["verdict"] = "FAIL"
            entry["spec_clause"] = getattr(fn, "__doc__", "") or ""
            entry["error"] = traceback.format_exc()
        verdicts.append(entry)
    return verdicts


def _run_f13():
    return b4_checks.f13_weight_sensitivity_sweep(step=0.05)


def _write_csv(f13: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "b4_weight_sensitivity.csv"
    fieldnames = [
        "pair",
        "W_face",
        "W_text",
        "face_scores",
        "text_scores",
        "fused_calm",
        "fused_neutral",
        "fused_distressed",
        "fused_state",
        "fused_confidence",
    ]
    with path.open("w", newline="", encoding="utf-8") as fh:
        fh.write(f"# {DISCLAIMER}\n")
        fh.write(f"# {NOT_VALIDATED}\n")
        fh.write("# Evidence vectors below are SYNTHETIC, hand-constructed, not from FER-2013 or Dev-v2.\n")
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        for row in f13["rows"]:
            w.writerow(row)
    return path


def _write_plot(f13: dict) -> tuple[Path | None, str]:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as e:  # noqa: BLE001
        return None, f"matplotlib unavailable ({e!r}); PNG not written"

    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    state_idx = {"calm": 0, "neutral": 1, "distressed": 2, "unknown": -1}
    pairs = [p[0] for p in b4_checks.F13_PAIRS]
    w_values = f13["w_values"]

    fig, ax = plt.subplots(figsize=(10, 6))
    for name in pairs:
        rows = [r for r in f13["rows"] if r["pair"] == name]
        rows.sort(key=lambda r: r["W_face"])
        ys = [state_idx[r["fused_state"]] for r in rows]
        ax.plot([r["W_face"] for r in rows], ys, marker="o", ms=3, label=name)
    ax.set_yticks([-1, 0, 1, 2])
    ax.set_yticklabels(["unknown", "calm", "neutral", "distressed"])
    ax.set_xlabel("W_face  (W_text = 1 - W_face)  — PLACEHOLDER, undecided pending Phase 7")
    ax.set_ylabel("fused state")
    ax.set_title("B4 F13 weight sensitivity — SYNTHETIC evidence, NOT validation")
    ax.grid(True, alpha=0.3)
    ax.legend(fontsize=7, loc="center left", bbox_to_anchor=(1.0, 0.5))
    fig.text(
        0.01,
        0.01,
        DISCLAIMER,
        fontsize=6,
        wrap=True,
    )
    fig.tight_layout(rect=(0, 0.04, 0.78, 1))
    path = PLOTS_DIR / "b4_weight_sensitivity.png"
    fig.savefig(path, dpi=130)
    plt.close(fig)
    return path, "written"


def main() -> int:
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    verdicts = _run_checks()
    f13 = _run_f13()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = _write_csv(f13)
    png_path, png_status = _write_plot(f13)

    conformance = {
        "artifact": "b4_contract_conformance.json",
        "phase": "B4 mood fusion layer — contract conformance",
        "generated_utc": now,
        "disclaimer": DISCLAIMER,
        "not_validated": NOT_VALIDATED,
        "governing_spec": "docs/system/MOOD_STATE_SPEC.md Part A (A4-A7), frozen at Gate 1A",
        "plan": "docs/plan/FUSION_B4_PLAN.md",
        "library_under_test": "dev/fusion/fusion/",
        "no_default_parameters": (
            "FusionParameters.require() raises MissingParameterError naming the first "
            "absent symbol; fuse() raises InvalidParameterError unless given a "
            "FusionParameters instance. There is no 0.5/0.5 fallback anywhere."
        ),
        "checks": verdicts,
        "f13_weight_sensitivity": {
            "spec_clause": f13["spec_clause"],
            "step": 0.05,
            "w_values": f13["w_values"],
            "synthetic_pairs": [
                {"name": n, "face_scores": list(fc), "text_scores": list(tc)}
                for n, fc, tc in b4_checks.F13_PAIRS
            ],
            "flips": f13["flips"],
            "csv": "b4_weight_sensitivity.csv",
            "plot": "plots/b4_weight_sensitivity.png" if png_path else f"NOT WRITTEN: {png_status}",
        },
        "summary": {
            "total": len(verdicts),
            "passed": sum(v["verdict"] == "PASS" for v in verdicts),
            "failed": sum(v["verdict"] == "FAIL" for v in verdicts),
        },
    }
    json_path = OUT_DIR / "b4_contract_conformance.json"
    json_path.write_text(json.dumps(conformance, indent=2), encoding="utf-8")

    # -- console ------------------------------------------------------------
    print(f"\n{DISCLAIMER}\n")
    print(f"{NOT_VALIDATED}\n")
    print("=" * 72)
    for v in verdicts:
        print(f"  {v['id']:<4} {v['verdict']:<4}  {v['description']}")
        print(f"        spec: {v['spec_clause']}")
        if v["verdict"] == "FAIL":
            print(v["error"])
    print("=" * 72)
    s = conformance["summary"]
    print(f"  {s['passed']}/{s['total']} PASS, {s['failed']} FAIL")
    print("=" * 72)
    print("\nF13 weight-sensitivity — where does the fused state flip as W_face 0 -> 1?\n")
    for fl in f13["flips"]:
        fp = (
            ", ".join(f"{a}->{b} at W_face={w:.2f}" for a, b, w in fl["flip_points"])
            if fl["flip_points"]
            else "no flip"
        )
        print(
            f"  {fl['pair']:<38} "
            f"[W_face=0: {fl['state_at_W_face_0']:<10}] "
            f"[W_face=1: {fl['state_at_W_face_1']:<10}]  {fp}"
        )
    print()
    print(f"wrote {json_path}")
    print(f"wrote {csv_path}")
    print(f"plot: {png_path}  ({png_status})")
    return 0 if s["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
