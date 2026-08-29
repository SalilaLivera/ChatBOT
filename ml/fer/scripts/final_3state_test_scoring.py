#!/usr/bin/env python3
"""REPRODUCTION of the FER final 3-state test scoring. NOT a new evaluation.

===============================================================================
WHAT THIS IS, AND WHAT IT IS NOT
===============================================================================
This script REPRODUCES an evaluation that has ALREADY BEEN RUN and whose result
is already recorded. It exists because the original scoring run did not leave a
script behind, which made the headline FER result non-reproducible.

    IT DOES NOT CONTACT THE TEST SET.
    IT DOES NOT PERFORM A NEW EVALUATION.
    IT DOES NOT WRITE, OVERWRITE, OR MODIFY ANY RESULT.

It reads the SAVED PREDICTION ARTIFACT (nb05_test_probabilities_finetuned.csv,
produced by notebook 05), re-derives the 3-state metrics under the FROZEN
configuration, and ASSERTS that they equal the values already recorded in
final_3state_test_metrics.json.

The distinction matters. The one-shot discipline governs CONTACTING the test
split and SELECTING a configuration on it. Recomputing a deterministic label
mapping over an already-saved predictions file, under a configuration that is
frozen and cannot be varied here, is a REPRODUCTION - it can only ever confirm
or contradict what is already recorded. It cannot produce a new number.

If this script FAILS, it means an artifact has drifted since the scoring run.
That is a finding to escalate, NOT something to fix by updating the expected
values.

===============================================================================
THE FROZEN CONFIGURATION - M1 . RULE A
===============================================================================
Frozen by docs/decisions/FER_7TO3_MAPPING_DECISION.md (2026-08-29).

    happy     -> CALM
    neutral   -> NEUTRAL
    surprise  -> NEUTRAL
    angry     -> DISTRESSED
    disgust   -> DISTRESSED
    fear      -> DISTRESSED
    sad       -> DISTRESSED

    Rule A: take the 7-class argmax, map THAT CLASS to its 3-state label.
            The same mapping is applied to the true label and to the prediction.

The mapping is a MODULE CONSTANT with no parameter, no CLI flag, and no override
path. There is deliberately no way to run this script against a different mapping
or a different aggregation rule. Adding one would turn a reproduction into a
second test-set evaluation.

MAPPING BASIS: supervisory expert judgement, consistent with the canonical
affective circumplex (Russell 1980). It is NOT AffectNet-derived - the per-class
valence/arousal statistics required by MOOD_STATE_SPEC B2.1 are not published.
See docs/decisions/AFFECTNET_VALENCE_AROUSAL_BASIS.md.

===============================================================================
CALIBRATION
===============================================================================
The predictions file predates notebook 07's temperature fitting, so its
probabilities are UNCALIBRATED. This does not matter and must not be "fixed":
temperature scaling is ARGMAX-INVARIANT (notebook 07 measured 0 of 3,589
predictions changed at T=5.727) and Rule A depends only on the argmax.

No temperature is applied. No confidence figure is reported - the values in this
file are uncalibrated and are NOT what the deployed service returns.

Usage:
    python ml/fer/scripts/final_3state_test_scoring.py

Exit code 0 = reproduced exactly. Non-zero = drift or guard failure.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import sys

# --------------------------------------------------------------------------
# FROZEN CONSTANTS - no CLI, no override
# --------------------------------------------------------------------------

MAPPING = {
    "happy": "CALM",
    "neutral": "NEUTRAL",
    "surprise": "NEUTRAL",
    "angry": "DISTRESSED",
    "disgust": "DISTRESSED",
    "fear": "DISTRESSED",
    "sad": "DISTRESSED",
}
STATES = ("CALM", "NEUTRAL", "DISTRESSED")
SEVEN_CLASSES = ("angry", "disgust", "fear", "happy", "neutral", "sad", "surprise")
PROB_COLUMNS = tuple(f"prob_{c}" for c in SEVEN_CLASSES)

EXPECTED_ROWS = 3589
EXPECTED_INPUT_SHA256 = (
    "4e207996350d969b2178ee318ceb28e0ec3e18bae0a5f74af9393694e547e597"
)

# Files that must never be opened by this script.
DENYLIST = (
    "nb05_test_probabilities_frozen",  # notebook-03 baseline: WRONG MODEL
    "nb04_val",
    "PublicTest",
    "PREGNANCY",
    "frozen_test",
    "final_evaluation",
)

TOL = 1e-12  # reproduction must be exact to floating-point noise, not "close"

_HERE = os.path.dirname(os.path.abspath(__file__))
# ml/fer/scripts -> ml/fer -> ml -> repo root
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(_HERE)))

INPUT_CSV = os.path.join(
    _REPO, "ml", "fer", "outputs", "nb05_test_probabilities_finetuned.csv"
)
RECORDED_JSON = os.path.join(
    _REPO, "ml", "fer", "outputs", "b3_final_test", "final_3state_test_metrics.json"
)
RECORDED_CM = os.path.join(
    _REPO, "ml", "fer", "outputs", "b3_final_test", "final_3state_confusion_matrix.csv"
)


class ReproductionError(RuntimeError):
    """Raised when an artifact has drifted since the scoring run."""


def guarded_open(path: str):
    """Refuse to open anything on the denylist. Fails hard; never skips."""
    for banned in DENYLIST:
        if banned.lower() in os.path.basename(path).lower():
            raise ReproductionError(
                f"DENYLIST: refusing to open {path!r} (matched {banned!r})"
            )
    if not os.path.isfile(path):
        raise ReproductionError(f"required artifact not found: {path}")
    return open(path, "r", encoding="utf-8", newline="")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def metrics_from_confusion(cm) -> dict:
    """All scalar metrics derived from a 3x3 confusion matrix (rows=true).

    Pure Python: this script must run in any environment, including ones
    without numpy or sklearn.
    """
    total = sum(sum(r) for r in cm)
    support = [sum(r) for r in cm]
    predicted = [sum(cm[i][j] for i in range(3)) for j in range(3)]

    precision, recall, f1 = [], [], []
    for i in range(3):
        p = cm[i][i] / predicted[i] if predicted[i] else 0.0
        r = cm[i][i] / support[i] if support[i] else 0.0
        precision.append(p)
        recall.append(r)
        f1.append(2 * p * r / (p + r) if (p + r) else 0.0)

    return {
        "n": total,
        "support": support,
        "predicted": predicted,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": sum(cm[i][i] for i in range(3)) / total,
        "macro_f1": sum(f1) / 3,
        "balanced_accuracy": sum(recall) / 3,
        "weighted_f1": sum(f1[i] * support[i] for i in range(3)) / total,
    }


def check(label: str, got, want, tol: float = 0.0) -> bool:
    if isinstance(got, float) or isinstance(want, float):
        ok = abs(got - want) <= tol
    else:
        ok = got == want
    print(f"  {'OK  ' if ok else 'FAIL'}  {label}")
    if not ok:
        print(f"          recomputed : {got!r}")
        print(f"          recorded   : {want!r}")
    return ok


def main() -> int:
    print("=" * 74)
    print("  FER FINAL 3-STATE SCORING - REPRODUCTION (not a new evaluation)")
    print("=" * 74)
    print("  Frozen configuration: M1 . Rule A")
    for cls in SEVEN_CLASSES:
        print(f"    {cls:9s} -> {MAPPING[cls]}")
    print()

    ok = True

    # -- integrity of the source artifact ----------------------------------
    print("[1] SOURCE ARTIFACT INTEGRITY")
    actual_sha = sha256_file(INPUT_CSV)
    ok &= check("input SHA-256 matches the scoring run", actual_sha,
                EXPECTED_INPUT_SHA256)
    if not ok:
        print("\n  The predictions file has CHANGED since the scoring run.")
        print("  STOP. Escalate. Do not update the expected hash.")
        return 2

    # -- re-derive the confusion matrix ------------------------------------
    print("\n[2] GUARDS ON THE SAVED PREDICTIONS")
    with guarded_open(INPUT_CSV) as fh:
        rows = list(csv.DictReader(fh))

    ok &= check("G2 row count", len(rows), EXPECTED_ROWS)
    ok &= check("G3 every basename is PrivateTest_",
                all(r["basename"].startswith("PrivateTest_") for r in rows), True)
    ok &= check("G4 every model == finetuned",
                {r["model"] for r in rows}, {"finetuned"})
    ok &= check("G5 true_class subset of the 7 classes",
                {r["true_class"] for r in rows} <= set(SEVEN_CLASSES), True)
    ok &= check("G5 predicted_class subset of the 7 classes",
                {r["predicted_class"] for r in rows} <= set(SEVEN_CLASSES), True)
    ok &= check("G7 mapping covers all 7 classes and all 3 states",
                (set(MAPPING) == set(SEVEN_CLASSES)
                 and set(MAPPING.values()) == set(STATES)), True)

    # G6: predicted_class must be the real argmax, not a stale column. This is
    # what makes Rule A a safe pure label-mapping operation.
    agree = 0
    for r in rows:
        probs = [float(r[c]) for c in PROB_COLUMNS]
        if SEVEN_CLASSES[probs.index(max(probs))] == r["predicted_class"]:
            agree += 1
    ok &= check(f"G6 predicted_class == argmax ({agree}/{len(rows)})",
                agree, len(rows))

    if not ok:
        print("\n  A guard failed. STOP - do not interpret any number below.")
        return 3

    # Rule A: argmax -> class -> state. Same mapping on true and predicted.
    idx = {s: i for i, s in enumerate(STATES)}
    cm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for r in rows:
        cm[idx[MAPPING[r["true_class"]]]][idx[MAPPING[r["predicted_class"]]]] += 1

    # -- compare against what is recorded ----------------------------------
    print("\n[3] CONFUSION MATRIX vs final_3state_confusion_matrix.csv")
    with guarded_open(RECORDED_CM) as fh:
        saved_cm = [[int(v) for v in row[1:]] for row in list(csv.reader(fh))[1:]]
    ok &= check("confusion matrix identical", cm, saved_cm)

    print("\n[4] SCALAR METRICS vs final_3state_test_metrics.json")
    m = metrics_from_confusion(cm)
    with guarded_open(RECORDED_JSON) as fh:
        recorded = json.load(fh)["primary_canonical_3589"]

    ok &= check("n", m["n"], recorded["n"])
    for key in ("macro_f1", "accuracy", "balanced_accuracy", "weighted_f1"):
        ok &= check(key, m[key], recorded[key], TOL)

    print("\n[5] RECOMPUTED VALUES (full precision)")
    for i, s in enumerate(STATES):
        print(f"  {s:11s} p={m['precision'][i]!r}")
        print(f"  {'':11s} r={m['recall'][i]!r}")
        print(f"  {'':11s} f1={m['f1'][i]!r}  support={m['support'][i]}")
    for key in ("macro_f1", "accuracy", "balanced_accuracy", "weighted_f1"):
        print(f"  {key:18s}: {m[key]!r}")

    print("\n" + "=" * 74)
    if ok:
        print("  REPRODUCED EXACTLY. No artifact has drifted.")
        print("  This confirms the recorded result; it does not create a new one.")
    else:
        print("  REPRODUCTION FAILED - an artifact has drifted since the scoring run.")
        print("  ESCALATE. Do not update the expected values to make this pass.")
    print("=" * 74)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
