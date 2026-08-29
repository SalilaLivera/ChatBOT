"""
B3-A: FER 7-class -> 3-state mood mapping CONSEQUENCE ANALYSIS (validation-only).

WHAT THIS IS
------------
This script is stage B3-A. It measures the CONSEQUENCES of four candidate
mappings from the FER 7-class emotion space {angry, disgust, fear, happy,
neutral, sad, surprise} onto a 3-state mood space {CALM, NEUTRAL, DISTRESSED}.

It runs on the VALIDATION split ONLY (nb04 PublicTest probabilities).

It does NOT choose a mapping. There is deliberately:
  - no ranking of candidates,
  - no notion of a "best" / "winner" / "recommended" candidate,
  - no selection logic anywhere in code, comments, or printed output.
Every candidate (including the M4 control, which exists to be falsifiable) is
carried through every diagnostic and reported side by side. Interpretation and
selection happen elsewhere, by a human, from these numbers.

DENYLIST (hard guard)
---------------------
Before ANY csv file is opened, the path string is lowercased and checked for the
substrings: "nb05_test", "test_probabilities", "privatetest".
If the path being opened contains any of them, a RuntimeError is raised.
This is applied to the FILE PATH ONLY, never to row values. (The validation
basenames literally contain "PublicTest_", which lowercases to "publictest..."
and does NOT contain the token "privatetest" -- so validation data is allowed.)

CALIBRATION
-----------
nb04 probabilities are raw / uncalibrated / overconfident. Deployment applies
temperature scaling with T = 5.727 (recovered in notebook 07). The calibrated
probabilities used as the primary signal here are:
    logits_proxy = log(clip(p_raw, 1e-12, 1))
    p_cal        = softmax(logits_proxy / T, axis=1)
This is exact for temperature scaling: log-softmax(z) = z - c(row), and softmax
is shift-invariant, so recovering logits up to a per-row constant is sufficient.
Temperature scaling preserves argmax (asserted).

INPUT
-----
ml/fer/outputs/nb04_val_probabilities.csv  (3589 rows)
columns: basename,true_label,true_class,predicted_label,predicted_class,
         prob_angry,prob_disgust,prob_fear,prob_happy,prob_neutral,prob_sad,prob_surprise

OUTPUT (see ARTIFACTS section at bottom of module docstring in code)
-------
ml/fer/outputs/b3_mapping/b3_mapping_summary.json
ml/fer/outputs/b3_mapping/b3_candidate_comparison.csv
ml/fer/outputs/b3_mapping/b3_error_decomposition.csv
ml/fer/outputs/b3_mapping/plots/induced_distribution_bars.png
ml/fer/outputs/b3_mapping/plots/distressed_rate_ruleA_vs_ruleB.png
ml/fer/outputs/b3_mapping/plots/confusion_3x3_grid.png
plus a full plain-text report to stdout.

No image is ever loaded; no plot contains a face.
"""

import json
import os
import sys

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.metrics import precision_recall_fscore_support, f1_score, confusion_matrix


# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
INPUT_FILE = os.path.join(REPO, "ml/fer/outputs/nb04_val_probabilities.csv")
OUT_DIR = os.path.join(REPO, "ml/fer/outputs/b3_mapping")
PLOT_DIR = os.path.join(OUT_DIR, "plots")

T = 5.727  # temperature from notebook 07 (exact recovery method)

SEVEN = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
PROB_COLS = ["prob_" + c for c in SEVEN]
STATES = ["CALM", "NEUTRAL", "DISTRESSED"]

DENYLIST = ["nb05_test", "test_probabilities", "privatetest"]

# Fixed part of every candidate mapping.
_FIXED = {
    "happy": "CALM",
    "neutral": "NEUTRAL",
    "angry": "DISTRESSED",
    "fear": "DISTRESSED",
    "sad": "DISTRESSED",
}
CANDIDATES = {
    "M1": {**_FIXED, "disgust": "DISTRESSED", "surprise": "NEUTRAL"},
    "M2": {**_FIXED, "disgust": "DISTRESSED", "surprise": "DISTRESSED"},
    "M3": {**_FIXED, "disgust": "NEUTRAL", "surprise": "NEUTRAL"},
    "M4": {**_FIXED, "disgust": "DISTRESSED", "surprise": "CALM"},  # control, kept
}

BULLET = "-" * 78


# --------------------------------------------------------------------------- #
# Safety / IO helpers
# --------------------------------------------------------------------------- #
def safe_open_csv(path):
    """Read a csv only after checking its path against the denylist."""
    low = str(path).lower()
    for token in DENYLIST:
        if token in low:
            raise RuntimeError(
                "DENYLIST hit: path %r contains forbidden token %r" % (path, token)
            )
    return pd.read_csv(path)


def to_native(obj):
    """Recursively convert numpy types/containers to plain python for json."""
    if isinstance(obj, dict):
        return {str(k): to_native(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_native(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return to_native(obj.tolist())
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def _json_default(o):
    return to_native(o)


# --------------------------------------------------------------------------- #
# Load + guards
# --------------------------------------------------------------------------- #
def load_and_guard():
    print(BULLET)
    print("GUARDS")
    print(BULLET)

    df = safe_open_csv(INPUT_FILE)
    print("guard 0 denylist       : PASS (path clear: %s)" % os.path.basename(INPUT_FILE))

    assert df.shape[0] == 3589, "expected 3589 rows, got %d" % df.shape[0]
    print("guard 1 row count 3589 : PASS")

    starts = df["basename"].astype(str).str.startswith("PublicTest_")
    assert bool(starts.all()), "not all basenames start with 'PublicTest_'"
    print("guard 2 split (PublicTest_ prefix on every basename) : PASS")

    got = set(df["true_class"].unique().tolist())
    assert got == set(SEVEN), "true_class set mismatch: %r" % got
    print("guard 3 true_class == 7 expected classes : PASS")

    P = df[PROB_COLS].to_numpy(dtype=np.float64)
    assert P.min() >= 0.0 and P.max() <= 1.0, "prob columns outside [0,1]"
    rowsums = P.sum(axis=1)
    assert np.allclose(rowsums, 1.0, atol=1e-3), (
        "prob rowsums not within 1e-3 of 1.0 (min %.6f max %.6f)"
        % (rowsums.min(), rowsums.max())
    )
    print(
        "guard 4 probs in [0,1], rowsums ~1 (max dev %.2e) : PASS"
        % np.abs(rowsums - 1.0).max()
    )
    print()
    return df, P


# --------------------------------------------------------------------------- #
# Calibration
# --------------------------------------------------------------------------- #
def calibrate(p_raw):
    logits_proxy = np.log(np.clip(p_raw, 1e-12, 1.0))
    z = logits_proxy / T
    z = z - z.max(axis=1, keepdims=True)
    ez = np.exp(z)
    p_cal = ez / ez.sum(axis=1, keepdims=True)

    a_raw = p_raw.argmax(axis=1)
    a_cal = p_cal.argmax(axis=1)
    mismatch = int((a_raw != a_cal).sum())
    print(BULLET)
    print("CALIBRATION")
    print(BULLET)
    print("T = %.3f" % T)
    print("argmax(p_cal) vs argmax(p_raw) mismatches: %d (expected 0)" % mismatch)
    assert mismatch == 0, "temperature scaling changed argmax -- impossible, check math"
    print("p_cal rowsum max dev: %.2e" % np.abs(p_cal.sum(axis=1) - 1.0).max())
    print()
    return p_cal


# --------------------------------------------------------------------------- #
# Mapping mechanics
# --------------------------------------------------------------------------- #
def state_index(name):
    return STATES.index(name)


def group_masks(mapping):
    """For a candidate, return dict state -> boolean length-7 vector over SEVEN
    and assert the 3 groups partition all 7 classes exactly once."""
    masks = {}
    for st in STATES:
        masks[st] = np.array([mapping[c] == st for c in SEVEN], dtype=bool)
    stacked = np.vstack([masks[st] for st in STATES])
    covered = stacked.sum(axis=0)
    assert np.all(covered == 1), (
        "candidate mapping groups do not partition the 7 classes exactly once: %r"
        % covered.tolist()
    )
    return masks


def rule_a_pred(p_cal, mapping):
    """argmax over 7 classes, then map to a state index."""
    arg7 = p_cal.argmax(axis=1)
    lut = np.array([state_index(mapping[SEVEN[i]]) for i in range(7)], dtype=int)
    return lut[arg7]


def rule_b_pred(p_cal, masks):
    """sum p_cal within each state group, then argmax the 3 sums.
    Also return the induced (already-normalised) 3-state prob matrix."""
    sums = np.column_stack([p_cal[:, masks[st]].sum(axis=1) for st in STATES])
    # p_cal rows sum to 1 within tight tolerance; raw probs only within 1e-3.
    # The 3 groups partition the 7 classes, so group sums inherit that rowsum.
    assert np.allclose(sums.sum(axis=1), 1.0, atol=2e-3), "rule B group sums != 1"
    sums = sums / sums.sum(axis=1, keepdims=True)
    return sums.argmax(axis=1), sums


def true_state_index(true_class_series, mapping):
    return true_class_series.map(lambda c: state_index(mapping[c])).to_numpy()


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def per_state_metrics(y_true, y_pred):
    p, r, f1, sup = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1, 2], zero_division=0
    )
    macro = f1_score(y_true, y_pred, labels=[0, 1, 2], average="macro", zero_division=0)
    per_state = {}
    for i, st in enumerate(STATES):
        per_state[st] = {
            "precision": float(p[i]),
            "recall": float(r[i]),
            "f1": float(f1[i]),
            "support": int(sup[i]),
        }
    return float(macro), per_state


def confusion_3x3(y_true, y_pred):
    return confusion_matrix(y_true, y_pred, labels=[0, 1, 2]).astype(int)


def frac_dist(y, k=3):
    out = np.zeros(k, dtype=float)
    for i in range(k):
        out[i] = float((y == i).mean())
    return out


def degenerate_collapse(pred_frac):
    return bool(np.any(pred_frac == 0.0) or np.any(pred_frac > 0.90))


# --------------------------------------------------------------------------- #
# Per candidate x rule diagnostics
# --------------------------------------------------------------------------- #
def diagnostics_for_rule(df, p_cal, mapping, masks, rule):
    y_true = true_state_index(df["true_class"], mapping)
    if rule == "A":
        y_pred = rule_a_pred(p_cal, mapping)
    else:
        y_pred, _ = rule_b_pred(p_cal, masks)

    macro, per_state = per_state_metrics(y_true, y_pred)
    cm = confusion_3x3(y_true, y_pred)
    pred_frac = frac_dist(y_pred)
    true_frac = frac_dist(y_true)
    dist_rate = float((y_pred == state_index("DISTRESSED")).mean())

    # per-source-class contribution: 7 x 3 counts (true source class -> pred state)
    src = df["true_class"].to_numpy()
    contrib = np.zeros((7, 3), dtype=int)
    for si, sc in enumerate(SEVEN):
        m = src == sc
        for pj in range(3):
            contrib[si, pj] = int(np.sum(y_pred[m] == pj))

    return {
        "y_true": y_true,
        "y_pred": y_pred,
        "macro_f1": macro,
        "per_state": per_state,
        "confusion_3x3": cm,
        "induced_pred_dist": dict(zip(STATES, pred_frac.tolist())),
        "true_state_dist": dict(zip(STATES, true_frac.tolist())),
        "distressed_rate": dist_rate,
        "degenerate_collapse": degenerate_collapse(pred_frac),
        "per_source_class_contribution": {
            SEVEN[i]: dict(zip(STATES, contrib[i].tolist())) for i in range(7)
        },
    }


# --------------------------------------------------------------------------- #
# Error decomposition (Rule A / 7-class-prediction view)
# --------------------------------------------------------------------------- #
def error_decomposition(df, mapping):
    true7 = df["true_class"].to_numpy()
    pred7 = df["predicted_class"].to_numpy()
    err = pred7 != true7

    rows = []
    tot_e = tot_h = tot_s = 0
    for sc in SEVEN:
        m = err & (true7 == sc)
        n_e = int(m.sum())
        if n_e == 0:
            n_h = n_s = 0
        else:
            healed = np.array(
                [mapping[a] == mapping[b] for a, b in zip(pred7[m], true7[m])]
            )
            n_h = int(healed.sum())
            n_s = int((~healed).sum())
        hr = float(n_h / n_e) if n_e else 0.0
        rows.append(
            {
                "source_class": sc,
                "n_errors_7class": n_e,
                "n_healed": n_h,
                "n_surviving": n_s,
                "heal_rate": hr,
            }
        )
        tot_e += n_e
        tot_h += n_h
        tot_s += n_s
    rows.append(
        {
            "source_class": "ALL",
            "n_errors_7class": tot_e,
            "n_healed": tot_h,
            "n_surviving": tot_s,
            "heal_rate": float(tot_h / tot_e) if tot_e else 0.0,
        }
    )
    return rows


# --------------------------------------------------------------------------- #
# surprise / disgust isolated
# --------------------------------------------------------------------------- #
def _class_pr(df, cls):
    true7 = df["true_class"].to_numpy()
    pred7 = df["predicted_class"].to_numpy()
    tp = int(np.sum((true7 == cls) & (pred7 == cls)))
    fn = int(np.sum((true7 == cls) & (pred7 != cls)))
    fp = int(np.sum((true7 != cls) & (pred7 == cls)))
    recall = float(tp / (tp + fn)) if (tp + fn) else 0.0
    precision = float(tp / (tp + fp)) if (tp + fp) else 0.0
    return tp, fn, fp, precision, recall


def isolate_class(df, p_cal, mapping, masks, cls):
    true7 = df["true_class"].to_numpy()
    tp, fn, fp, precision, recall = _class_pr(df, cls)
    n_true = int(np.sum(true7 == cls))

    yA = rule_a_pred(p_cal, mapping)
    yB, _ = rule_b_pred(p_cal, masks)

    m_true = true7 == cls
    histA_true = dict(zip(STATES, frac_counts(yA[m_true])))
    histB_true = dict(zip(STATES, frac_counts(yB[m_true])))

    arg7 = p_cal.argmax(axis=1)
    m_arg = arg7 == SEVEN.index(cls)
    n_arg = int(m_arg.sum())
    histA_arg = dict(zip(STATES, frac_counts(yA[m_arg])))
    histB_arg = dict(zip(STATES, frac_counts(yB[m_arg])))

    return {
        "n_true_rows": n_true,
        "sevenclass_tp": tp,
        "sevenclass_fn": fn,
        "sevenclass_fp": fp,
        "sevenclass_precision": precision,
        "sevenclass_recall": recall,
        "true_rows_landing_ruleA": histA_true,
        "true_rows_landing_ruleB": histB_true,
        "n_rows_with_class_as_7class_argmax": n_arg,
        "argmax_rows_landing_ruleA": histA_arg,
        "argmax_rows_landing_ruleB": histB_arg,
    }


def frac_counts(y):
    """Return raw counts per state (length 3) as ints."""
    return [int(np.sum(y == i)) for i in range(3)]


# --------------------------------------------------------------------------- #
# ECE under Rule B
# --------------------------------------------------------------------------- #
def ece_rule_b(df, p_cal, mapping, masks, n_bins=10):
    y_true = true_state_index(df["true_class"], mapping)
    y_pred, induced = rule_b_pred(p_cal, masks)
    conf = induced.max(axis=1)
    correct = (y_pred == y_true).astype(float)

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    N = len(conf)
    ece = 0.0
    table = []
    for b in range(n_bins):
        lo, hi = edges[b], edges[b + 1]
        if b == n_bins - 1:
            m = (conf >= lo) & (conf <= hi)
        else:
            m = (conf >= lo) & (conf < hi)
        n_b = int(m.sum())
        if n_b == 0:
            table.append(
                {"bin": b + 1, "range": [float(lo), float(hi)],
                 "mean_conf": 0.0, "emp_acc": 0.0, "n": 0}
            )
            continue
        mc = float(conf[m].mean())
        ma = float(correct[m].mean())
        ece += (n_b / N) * abs(ma - mc)
        table.append(
            {"bin": b + 1, "range": [float(lo), float(hi)],
             "mean_conf": mc, "emp_acc": ma, "n": n_b}
        )
    return float(ece), table


# --------------------------------------------------------------------------- #
# Sensitivity: Rule B distressed rate on RAW probs
# --------------------------------------------------------------------------- #
def rule_b_distressed_rate_raw(p_raw, mapping, masks):
    yB, _ = rule_b_pred(p_raw, masks)  # p_raw rows already sum ~1; group sums ~1
    return float((yB == state_index("DISTRESSED")).mean())


# --------------------------------------------------------------------------- #
# Plots (no faces -- bars / heatmaps only)
# --------------------------------------------------------------------------- #
def plot_induced_distribution(results):
    cand = list(CANDIDATES.keys())
    fig, axes = plt.subplots(1, 2, figsize=(13, 5), sharey=True)
    for ax, rule in zip(axes, ["A", "B"]):
        x = np.arange(len(cand))
        w = 0.25
        for k, st in enumerate(STATES):
            vals = [results[c][rule]["induced_pred_dist"][st] for c in cand]
            ax.bar(x + (k - 1) * w, vals, w, label=st)
        ax.set_xticks(x)
        ax.set_xticklabels(cand)
        ax.set_title("Rule %s -- predicted state fraction" % rule)
        ax.set_ylim(0, 1)
        ax.legend(fontsize=8)
    fig.suptitle("Induced predicted-state distribution (validation)")
    fig.tight_layout()
    fig.savefig(os.path.join(PLOT_DIR, "induced_distribution_bars.png"), dpi=120)
    plt.close(fig)


def plot_distressed_rate(results, raw_sens):
    cand = list(CANDIDATES.keys())
    x = np.arange(len(cand))
    w = 0.35
    fig, ax = plt.subplots(figsize=(9, 5))
    a_vals = [results[c]["A"]["distressed_rate"] for c in cand]
    b_vals = [results[c]["B"]["distressed_rate"] for c in cand]
    ax.bar(x - w / 2, a_vals, w, label="Rule A")
    ax.bar(x + w / 2, b_vals, w, label="Rule B")
    for i, c in enumerate(cand):
        ax.plot([x[i] + w / 2], [raw_sens[c]], marker="D", color="black",
                alpha=0.35, markersize=8,
                label="Rule B raw-prob sensitivity" if i == 0 else None)
    ax.set_xticks(x)
    ax.set_xticklabels(cand)
    ax.set_ylabel("DISTRESSED prediction rate")
    ax.set_title("DISTRESSED rate: Rule A vs Rule B (faint marker = raw-prob sensitivity)")
    ax.set_ylim(0, 1)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOT_DIR, "distressed_rate_ruleA_vs_ruleB.png"), dpi=120)
    plt.close(fig)


def plot_confusion_grid(results):
    cand = list(CANDIDATES.keys())
    fig, axes = plt.subplots(4, 2, figsize=(9, 16))
    for r, c in enumerate(cand):
        for k, rule in enumerate(["A", "B"]):
            ax = axes[r, k]
            cm = np.asarray(results[c][rule]["confusion_3x3"])
            im = ax.imshow(cm, cmap="Blues")
            ax.set_title("%s -- Rule %s" % (c, rule), fontsize=10)
            ax.set_xticks(range(3))
            ax.set_yticks(range(3))
            ax.set_xticklabels(STATES, rotation=45, ha="right", fontsize=7)
            ax.set_yticklabels(STATES, fontsize=7)
            ax.set_xlabel("predicted", fontsize=8)
            ax.set_ylabel("true", fontsize=8)
            for i in range(3):
                for j in range(3):
                    ax.text(j, i, str(int(cm[i, j])), ha="center", va="center",
                            color="black", fontsize=9)
            fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.suptitle("3x3 confusion matrices (rows=true state, cols=pred state), raw counts")
    fig.tight_layout(rect=[0, 0, 1, 0.98])
    fig.savefig(os.path.join(PLOT_DIR, "confusion_3x3_grid.png"), dpi=120)
    plt.close(fig)


# --------------------------------------------------------------------------- #
# Reporting helpers
# --------------------------------------------------------------------------- #
def fmt_mat(m):
    lines = []
    header = "            " + "".join("%12s" % s for s in STATES)
    lines.append(header)
    for i, st in enumerate(STATES):
        lines.append("%-12s" % st + "".join("%12d" % int(m[i, j]) for j in range(3)))
    return "\n".join(lines)


def print_rule_block(cand, rule, d):
    print("  Rule %s" % rule)
    print("  macro-F1 (3-state): %.4f" % d["macro_f1"])
    print("  confusion (rows=true, cols=pred):")
    print(fmt_mat(np.asarray(d["confusion_3x3"])))
    print("  per-state precision / recall / f1 / support:")
    for st in STATES:
        s = d["per_state"][st]
        print("    %-11s p=%.4f r=%.4f f1=%.4f support=%d"
              % (st, s["precision"], s["recall"], s["f1"], s["support"]))
    print("  induced predicted-state distribution:")
    for st in STATES:
        print("    %-11s %.4f" % (st, d["induced_pred_dist"][st]))
    print("  true-state distribution (this candidate):")
    for st in STATES:
        print("    %-11s %.4f" % (st, d["true_state_dist"][st]))
    print("  DISTRESSED rate: %.4f" % d["distressed_rate"])
    print("  degenerate_collapse: %s" % d["degenerate_collapse"])
    print("  per-source-class -> predicted state (counts):")
    print("            " + "".join("%12s" % s for s in STATES))
    for sc in SEVEN:
        row = d["per_source_class_contribution"][sc]
        print("    %-8s" % sc + "".join("%12d" % row[st] for st in STATES))
    print()


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PLOT_DIR, exist_ok=True)

    df, p_raw = load_and_guard()
    p_cal = calibrate(p_raw)

    # 7-class baseline context
    seven_macro = float(
        f1_score(df["true_class"], df["predicted_class"], labels=SEVEN, average="macro")
    )
    print(BULLET)
    print("7-CLASS BASELINE CONTEXT (validation)")
    print(BULLET)
    print("7-class macro-F1 (argmax predictions in file): %.4f" % seven_macro)
    print("(all 3-state figures below are to be read against this number)")
    print()

    results = {}          # candidate -> rule -> diagnostics
    extras = {}            # candidate -> extra dict
    raw_sens = {}          # candidate -> rule B distressed rate on raw probs
    decomp_rows_all = []   # for csv

    for cand, mapping in CANDIDATES.items():
        masks = group_masks(mapping)
        print(BULLET)
        print("CANDIDATE %s   mapping: %s" % (cand, {c: mapping[c] for c in SEVEN}))
        print(BULLET)

        results[cand] = {}
        for rule in ["A", "B"]:
            d = diagnostics_for_rule(df, p_cal, mapping, masks, rule)
            results[cand][rule] = d
            print_rule_block(cand, rule, d)

        # error decomposition
        decomp = error_decomposition(df, mapping)
        for row in decomp:
            r = dict(row)
            r["candidate"] = cand
            decomp_rows_all.append(r)
        print("  ERROR DECOMPOSITION (7-class error -> HEALED / SURVIVING under merge):")
        print("    %-9s %10s %8s %10s %10s"
              % ("source", "n_err_7c", "healed", "surviving", "heal_rate"))
        for row in decomp:
            print("    %-9s %10d %8d %10d %10.4f"
                  % (row["source_class"], row["n_errors_7class"], row["n_healed"],
                     row["n_surviving"], row["heal_rate"]))
        print()

        # isolated surprise / disgust
        surprise_iso = isolate_class(df, p_cal, mapping, masks, "surprise")
        disgust_iso = isolate_class(df, p_cal, mapping, masks, "disgust")
        print("  ISOLATED: surprise")
        _print_iso(surprise_iso)
        print("  ISOLATED: disgust")
        _print_iso(disgust_iso)

        # ECE under Rule B (p_cal primary)
        ece, rel_table = ece_rule_b(df, p_cal, mapping, masks)
        print("  ECE (Rule B, p_cal, 10 equal-width bins): %.4f" % ece)
        print("    %-5s %-14s %-12s %-12s %-8s" % ("bin", "range", "mean_conf", "emp_acc", "n"))
        for t in rel_table:
            print("    %-5d [%.2f,%.2f]     %-12.4f %-12.4f %-8d"
                  % (t["bin"], t["range"][0], t["range"][1], t["mean_conf"],
                     t["emp_acc"], t["n"]))
        print()

        # sensitivity
        rs = rule_b_distressed_rate_raw(p_raw, mapping, masks)
        raw_sens[cand] = rs
        print("  SENSITIVITY (Rule B DISTRESSED rate on RAW/uncalibrated probs): %.4f" % rs)
        print("    (compare to calibrated Rule B DISTRESSED rate %.4f and Rule A %.4f)"
              % (results[cand]["B"]["distressed_rate"],
                 results[cand]["A"]["distressed_rate"]))
        print()

        extras[cand] = {
            "error_decomposition_by_source": {
                row["source_class"]: {
                    "n_errors_7class": row["n_errors_7class"],
                    "n_healed": row["n_healed"],
                    "n_surviving": row["n_surviving"],
                    "heal_rate": row["heal_rate"],
                }
                for row in decomp
            },
            "surprise_isolated": surprise_iso,
            "disgust_isolated": disgust_iso,
            "ece_ruleB": ece,
            "ruleB_reliability": rel_table,
            "ruleB_distressed_rate_raw_sensitivity": rs,
        }

    # ------------------------------------------------------------------- #
    # Artifacts
    # ------------------------------------------------------------------- #
    summary = {}
    for cand in CANDIDATES:
        summary[cand] = {}
        for rule in ["A", "B"]:
            d = results[cand][rule]
            summary[cand][rule] = {
                "macro_f1": d["macro_f1"],
                "per_state": d["per_state"],
                "confusion_3x3": np.asarray(d["confusion_3x3"]).tolist(),
                "induced_pred_dist": d["induced_pred_dist"],
                "true_state_dist": d["true_state_dist"],
                "distressed_rate": d["distressed_rate"],
                "degenerate_collapse": d["degenerate_collapse"],
                "per_source_class_contribution": d["per_source_class_contribution"],
            }
        summary[cand].update(extras[cand])
        summary[cand]["mapping"] = {c: CANDIDATES[cand][c] for c in SEVEN}

    summary["seven_class_macro_f1_val"] = seven_macro
    summary["T"] = T
    summary["n_rows"] = int(df.shape[0])
    summary["generated_by"] = "ml/fer/scripts/b3_mapping_analysis.py"
    summary["input_file"] = INPUT_FILE
    summary["states_order"] = STATES
    summary["seven_class_order"] = SEVEN
    summary["note"] = (
        "B3-A consequence analysis, validation-only. Enumerates 4 candidate "
        "mappings; does NOT rank or select one."
    )

    with open(os.path.join(OUT_DIR, "b3_mapping_summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2, default=_json_default)

    # comparison csv
    comp_rows = []
    for cand in CANDIDATES:
        for rule in ["A", "B"]:
            d = results[cand][rule]
            ps = d["per_state"]
            pf = d["induced_pred_dist"]
            comp_rows.append({
                "candidate": cand,
                "rule": rule,
                "macro_f1": d["macro_f1"],
                "calm_p": ps["CALM"]["precision"],
                "calm_r": ps["CALM"]["recall"],
                "calm_f1": ps["CALM"]["f1"],
                "neutral_p": ps["NEUTRAL"]["precision"],
                "neutral_r": ps["NEUTRAL"]["recall"],
                "neutral_f1": ps["NEUTRAL"]["f1"],
                "distressed_p": ps["DISTRESSED"]["precision"],
                "distressed_r": ps["DISTRESSED"]["recall"],
                "distressed_f1": ps["DISTRESSED"]["f1"],
                "pred_frac_calm": pf["CALM"],
                "pred_frac_neutral": pf["NEUTRAL"],
                "pred_frac_distressed": pf["DISTRESSED"],
                "distressed_rate": d["distressed_rate"],
                "degenerate_collapse": d["degenerate_collapse"],
            })
    pd.DataFrame(comp_rows).to_csv(
        os.path.join(OUT_DIR, "b3_candidate_comparison.csv"), index=False
    )

    pd.DataFrame(
        decomp_rows_all,
        columns=["candidate", "source_class", "n_errors_7class", "n_healed",
                 "n_surviving", "heal_rate"],
    ).to_csv(os.path.join(OUT_DIR, "b3_error_decomposition.csv"), index=False)

    # plots
    plot_induced_distribution(results)
    plot_distressed_rate(results, raw_sens)
    plot_confusion_grid(results)

    print(BULLET)
    print("ARTIFACTS WRITTEN")
    print(BULLET)
    for p in [
        os.path.join(OUT_DIR, "b3_mapping_summary.json"),
        os.path.join(OUT_DIR, "b3_candidate_comparison.csv"),
        os.path.join(OUT_DIR, "b3_error_decomposition.csv"),
        os.path.join(PLOT_DIR, "induced_distribution_bars.png"),
        os.path.join(PLOT_DIR, "distressed_rate_ruleA_vs_ruleB.png"),
        os.path.join(PLOT_DIR, "confusion_3x3_grid.png"),
    ]:
        print("  " + p)
    print()
    print("Done. B3-A measured consequences of 4 candidate mappings. No mapping selected.")


def _print_iso(iso):
    print("    n_true_rows=%d  7-class tp=%d fn=%d fp=%d  precision=%.4f recall=%.4f"
          % (iso["n_true_rows"], iso["sevenclass_tp"], iso["sevenclass_fn"],
             iso["sevenclass_fp"], iso["sevenclass_precision"], iso["sevenclass_recall"]))
    print("    true rows land (counts CALM/NEUTRAL/DISTRESSED)  Rule A: %s   Rule B: %s"
          % ([iso["true_rows_landing_ruleA"][s] for s in STATES],
             [iso["true_rows_landing_ruleB"][s] for s in STATES]))
    print("    n rows with this class as 7-class argmax: %d"
          % iso["n_rows_with_class_as_7class_argmax"])
    print("    those argmax rows land (counts)  Rule A: %s   Rule B: %s"
          % ([iso["argmax_rows_landing_ruleA"][s] for s in STATES],
             [iso["argmax_rows_landing_ruleB"][s] for s in STATES]))
    print()


if __name__ == "__main__":
    sys.exit(main())
