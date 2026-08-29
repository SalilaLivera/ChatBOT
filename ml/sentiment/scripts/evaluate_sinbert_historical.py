import os
import time
import json
import pandas as pd
import torch

from transformers import AutoTokenizer, AutoModelForSequenceClassification
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
    classification_report,
    cohen_kappa_score,
)


# ============================================================
# CONFIGURATION
# ============================================================

DATASET_PATH = r"C:\Users\Yasindu\Desktop\chat\chatset perp\PREGNANCY_FROZEN_TEST_SET.csv"

MODEL_PATH = (
    r"C:\Users\Yasindu\.cache\huggingface\hub"
    r"\models--sinhala-nlp--sinhala-sentiment-analysis-sinbert-small"
    r"\snapshots\7059f20a28a2b1e2ff2f45b13d6956435cdacb6a"
    r"\best_model"
)

OUTPUT_DIR = "sinbert_evaluation_results"

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# LOAD DATASET
# ============================================================

print("=" * 70)
print("SINBERT PREGNANCY-DOMAIN EVALUATION")
print("=" * 70)

print("\nLoading frozen dataset...")

df = pd.read_csv(DATASET_PATH)

print(f"Records loaded: {len(df)}")

required_columns = [
    "record_id",
    "language",
    "text",
    "adjudicated_label",
]

missing = [c for c in required_columns if c not in df.columns]

if missing:
    raise ValueError(f"Missing required columns: {missing}")

if len(df) != 120:
    raise ValueError(
        f"Frozen dataset must contain exactly 120 records. Found {len(df)}."
    )

print("Dataset validation: PASSED")


# ============================================================
# LOAD MODEL
# ============================================================

print("\nLoading SinBERT-small...")

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)

model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_PATH
)

model.eval()

device = torch.device("cpu")
model.to(device)

print("Model loaded successfully.")
print(f"Device: {device}")
print(f"Parameters: {sum(p.numel() for p in model.parameters()):,}")

print("\nModel config labels:")
print(model.config.id2label)


# ============================================================
# AUTHORITATIVE LABEL MAPPING
# ============================================================

# From the model's model_args.json:
#
# NEUTRAL  = 0
# POSITIVE = 1
# NEGATIVE = 2
#
# The model config may expose LABEL_0 etc., so we explicitly
# use the documented training mapping.

MODEL_LABELS = {
    0: "NEUTRAL",
    1: "POSITIVE",
    2: "NEGATIVE",
}


# ============================================================
# INFERENCE
# ============================================================

print("\nRunning inference on frozen 120...")

records = []

for index, row in df.iterrows():

    text = str(row["text"])

    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
    )

    inputs = {
        key: value.to(device)
        for key, value in inputs.items()
    }

    start = time.perf_counter()

    with torch.no_grad():
        outputs = model(**inputs)

    end = time.perf_counter()

    latency_ms = (end - start) * 1000

    probabilities = torch.softmax(
        outputs.logits,
        dim=-1
    )[0]

    predicted_id = int(torch.argmax(probabilities).item())

    predicted_label = MODEL_LABELS[predicted_id]

    neutral_prob = float(probabilities[0].item())
    positive_prob = float(probabilities[1].item())
    negative_prob = float(probabilities[2].item())

    confidence = float(probabilities[predicted_id].item())

    records.append(
        {
            "record_id": row["record_id"],
            "language": row["language"],
            "text": text,

            "human_ground_truth": row["adjudicated_label"],

            "model_label": predicted_label,
            "model_label_id": predicted_id,

            "neutral_probability": neutral_prob,
            "positive_probability": positive_prob,
            "negative_probability": negative_prob,

            "model_confidence": confidence,
            "latency_ms": latency_ms,
        }
    )

    print(
        f"[{index + 1:03d}/120] "
        f"{row['record_id']} | "
        f"{row['language']} | "
        f"Human={row['adjudicated_label']} | "
        f"Model={predicted_label} | "
        f"{latency_ms:.2f} ms"
    )


results = pd.DataFrame(records)


# ============================================================
# SAVE RAW PREDICTIONS
# ============================================================

raw_path = os.path.join(
    OUTPUT_DIR,
    "raw_model_predictions.csv"
)

results.to_csv(
    raw_path,
    index=False,
    encoding="utf-8-sig"
)

print(f"\nRaw predictions saved to:")
print(raw_path)


# ============================================================
# RAW MODEL SENTIMENT VS HUMAN MOOD
# ============================================================

human_labels = [
    "CALM",
    "NEUTRAL",
    "DISTRESSED",
]

model_labels = [
    "POSITIVE",
    "NEUTRAL",
    "NEGATIVE",
]

print("\n" + "=" * 70)
print("RAW HUMAN MOOD × MODEL SENTIMENT")
print("=" * 70)

raw_cm = pd.crosstab(
    results["human_ground_truth"],
    results["model_label"],
    dropna=False,
)

raw_cm = raw_cm.reindex(
    index=human_labels,
    columns=model_labels,
    fill_value=0,
)

print(raw_cm)

raw_cm.to_csv(
    os.path.join(
        OUTPUT_DIR,
        "raw_human_mood_x_model_sentiment.csv"
    )
)


# ============================================================
# MAPPING: SENTIMENT → MOOD
# ============================================================

# Proposed mapping from the evaluation protocol:
#
# POSITIVE  -> CALM
# NEUTRAL   -> NEUTRAL
# NEGATIVE  -> DISTRESSED

MAPPED_LABELS = {
    "POSITIVE": "CALM",
    "NEUTRAL": "NEUTRAL",
    "NEGATIVE": "DISTRESSED",
}

results["mapped_mood"] = results["model_label"].map(
    MAPPED_LABELS
)


# ============================================================
# OVERALL METRICS
# ============================================================

y_true = results["human_ground_truth"]
y_pred = results["mapped_mood"]

accuracy = accuracy_score(
    y_true,
    y_pred,
)

precision, recall, f1, support = precision_recall_fscore_support(
    y_true,
    y_pred,
    labels=human_labels,
    zero_division=0,
)

macro_precision = precision.mean()
macro_recall = recall.mean()
macro_f1 = f1.mean()

kappa = cohen_kappa_score(
    y_true,
    y_pred,
    labels=human_labels,
)

print("\n" + "=" * 70)
print("MAPPED MODEL PERFORMANCE")
print("=" * 70)

print(f"Accuracy:         {accuracy:.4f}")
print(f"Macro Precision:  {macro_precision:.4f}")
print(f"Macro Recall:     {macro_recall:.4f}")
print(f"Macro F1:         {macro_f1:.4f}")
print(f"Cohen's Kappa:    {kappa:.4f}")


# ============================================================
# PER-CLASS METRICS
# ============================================================

metrics_df = pd.DataFrame(
    {
        "class": human_labels,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "support": support,
    }
)

print("\nPer-class metrics:")
print(metrics_df.to_string(index=False))

metrics_df.to_csv(
    os.path.join(
        OUTPUT_DIR,
        "per_class_metrics.csv"
    ),
    index=False,
)


# ============================================================
# CONFUSION MATRIX
# ============================================================

mapped_cm = confusion_matrix(
    y_true,
    y_pred,
    labels=human_labels,
)

mapped_cm_df = pd.DataFrame(
    mapped_cm,
    index=[
        f"TRUE_{x}"
        for x in human_labels
    ],
    columns=[
        f"PRED_{x}"
        for x in human_labels
    ],
)

print("\nConfusion matrix:")
print(mapped_cm_df)

mapped_cm_df.to_csv(
    os.path.join(
        OUTPUT_DIR,
        "confusion_matrix.csv"
    )
)


# ============================================================
# CLASSIFICATION REPORT
# ============================================================

report = classification_report(
    y_true,
    y_pred,
    labels=human_labels,
    zero_division=0,
)

print("\nClassification report:")
print(report)

with open(
    os.path.join(
        OUTPUT_DIR,
        "classification_report.txt"
    ),
    "w",
    encoding="utf-8",
) as f:
    f.write(report)


# ============================================================
# LANGUAGE-SPECIFIC RESULTS
# ============================================================

language_rows = []

print("\n" + "=" * 70)
print("LANGUAGE-SPECIFIC PERFORMANCE")
print("=" * 70)

for language in ["SI", "EN"]:

    subset = results[
        results["language"] == language
    ]

    true_lang = subset["human_ground_truth"]
    pred_lang = subset["mapped_mood"]

    acc = accuracy_score(
        true_lang,
        pred_lang,
    )

    _, _, lang_f1, _ = precision_recall_fscore_support(
        true_lang,
        pred_lang,
        labels=human_labels,
        zero_division=0,
    )

    macro_f1_lang = lang_f1.mean()

    language_rows.append(
        {
            "language": language,
            "n": len(subset),
            "accuracy": acc,
            "macro_f1": macro_f1_lang,
        }
    )

    print(
        f"{language}: "
        f"N={len(subset)}, "
        f"Accuracy={acc:.4f}, "
        f"Macro-F1={macro_f1_lang:.4f}"
    )

language_df = pd.DataFrame(language_rows)

language_df.to_csv(
    os.path.join(
        OUTPUT_DIR,
        "language_metrics.csv"
    ),
    index=False,
)


# ============================================================
# LATENCY
# ============================================================

latencies = results["latency_ms"]

latency_summary = {
    "n": len(latencies),
    "mean_ms": float(latencies.mean()),
    "median_ms": float(latencies.median()),
    "p95_ms": float(latencies.quantile(0.95)),
    "min_ms": float(latencies.min()),
    "max_ms": float(latencies.max()),
}

print("\n" + "=" * 70)
print("LATENCY")
print("=" * 70)

for key, value in latency_summary.items():
    if key == "n":
        print(f"{key}: {value}")
    else:
        print(f"{key}: {value:.2f}")


with open(
    os.path.join(
        OUTPUT_DIR,
        "latency_summary.json"
    ),
    "w",
    encoding="utf-8",
) as f:
    json.dump(
        latency_summary,
        f,
        indent=2,
    )


# ============================================================
# SAFETY-RELEVANT ERRORS
# ============================================================

safety_cases = results[
    (
        (results["human_ground_truth"] == "DISTRESSED")
        &
        (results["mapped_mood"].isin(["CALM", "NEUTRAL"]))
    )
    |
    (
        (results["human_ground_truth"] == "CALM")
        &
        (results["mapped_mood"] == "DISTRESSED")
    )
].copy()

safety_path = os.path.join(
    OUTPUT_DIR,
    "safety_relevant_errors.csv"
)

safety_cases.to_csv(
    safety_path,
    index=False,
    encoding="utf-8-sig"
)

print("\nSafety-relevant error count:")
print(len(safety_cases))

print(f"Saved to: {safety_path}")


# ============================================================
# HIGH-CONFIDENCE ERRORS
# ============================================================

high_conf_errors = results[
    (results["human_ground_truth"] != results["mapped_mood"])
    &
    (results["model_confidence"] >= 0.80)
].copy()

high_conf_path = os.path.join(
    OUTPUT_DIR,
    "high_confidence_errors.csv"
)

high_conf_errors.to_csv(
    high_conf_path,
    index=False,
    encoding="utf-8-sig"
)

print("\nHigh-confidence errors (>= 0.80):")
print(len(high_conf_errors))


# ============================================================
# FINAL SUMMARY
# ============================================================

summary = {
    "dataset": "PREGNANCY_FROZEN_TEST_SET.csv",
    "n": len(results),
    "overall_accuracy": float(accuracy),
    "macro_precision": float(macro_precision),
    "macro_recall": float(macro_recall),
    "macro_f1": float(macro_f1),
    "cohen_kappa": float(kappa),
    "mapping": MAPPED_LABELS,
    "latency": latency_summary,
    "safety_relevant_errors": len(safety_cases),
    "high_confidence_errors": len(high_conf_errors),
}

with open(
    os.path.join(
        OUTPUT_DIR,
        "evaluation_summary.json"
    ),
    "w",
    encoding="utf-8",
) as f:
    json.dump(
        summary,
        f,
        indent=2,
    )


print("\n" + "=" * 70)
print("EVALUATION COMPLETE")
print("=" * 70)

print(f"Results directory: {OUTPUT_DIR}")
print(f"Macro-F1: {macro_f1:.4f}")
print(f"Accuracy: {accuracy:.4f}")
print(f"Median latency: {latency_summary['median_ms']:.2f} ms")
print(f"P95 latency: {latency_summary['p95_ms']:.2f} ms")