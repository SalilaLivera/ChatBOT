#!/usr/bin/env bash
# NB08 device benchmark — P-02 on a physical Android device (arm64-v8a).
# Mode B fallback script. Run from a machine with adb + the arm64 benchmark_model binary.
# Never report emulator/x86 timings as device results. Never recommend fullint8.
set -euo pipefail

MODELS_DIR="${MODELS_DIR:-$(cd "$(dirname "$0")/../models" && pwd)}"
BENCH_BIN="${TFLITE_BENCHMARK_MODEL:?set TFLITE_BENCHMARK_MODEL to the arm64 benchmark_model binary}"
REMOTE=/data/local/tmp
VARIANTS=(float32 float16 dynint8 fullint8)
OUT="${1:-nb08_device_benchmark_raw.txt}"

# --- 1. device check ---
adb devices
STATE=$(adb get-state 2>/dev/null || true)
if [ "$STATE" != "device" ]; then echo "no authorised device (state=$STATE)"; exit 1; fi
adb shell getprop ro.build.type
adb shell getprop ro.product.model

# --- 2. device identity block ---
{
  echo "=== DEVICE IDENTITY ==="
  for K in ro.product.manufacturer ro.product.model ro.product.board ro.board.platform \
           ro.hardware ro.soc.manufacturer ro.soc.model ro.build.version.release \
           ro.build.version.sdk ro.product.cpu.abi ro.build.type; do
    echo "$K = $(adb shell getprop $K | tr -d '\r')"
  done
  echo "cpu_cores = $(adb shell cat /proc/cpuinfo | grep -c ^processor)"
  adb shell cat /proc/meminfo | grep MemTotal
} | tee "$OUT"

# --- 3. push ---
for V in "${VARIANTS[@]}"; do
  adb push "${MODELS_DIR}/fer_mobilenetv2_96_${V}.tflite" "${REMOTE}/"
done
adb push "$BENCH_BIN" "${REMOTE}/android_aarch64_benchmark_model"
adb shell chmod 755 "${REMOTE}/android_aarch64_benchmark_model"

# --- 4. full matrix: 4 variants x threads {1,2,4} x xnnpack {true,false} ---
for V in "${VARIANTS[@]}"; do
  for T in 1 2 4; do
    for X in true false; do
      echo "=== ${V} threads=${T} xnnpack=${X} ===" | tee -a "$OUT"
      adb shell "${REMOTE}/android_aarch64_benchmark_model" \
        --graph="${REMOTE}/fer_mobilenetv2_96_${V}.tflite" \
        --num_threads="${T}" --use_xnnpack="${X}" \
        --warmup_runs=50 --num_runs=200 \
        --enable_op_profiling=false \
        --profiling_output_csv_file="${REMOTE}/prof_${V}_${T}_${X}.csv" 2>&1 | tee -a "$OUT"
      adb pull "${REMOTE}/prof_${V}_${T}_${X}.csv" "./prof_${V}_${T}_${X}.csv" || true
    done
  done
done

# --- 5. thermal run of the winner (edit WINNER/WT/WX after inspecting the matrix) ---
WINNER="${WINNER:-float16}"; WT="${WT:-4}"; WX="${WX:-true}"
if [ "$WINNER" = "fullint8" ]; then echo "refusing: fullint8 is REJECTED"; exit 1; fi
for B in 1 2 3 4 5; do
  echo "=== THERMAL batch ${B} : ${WINNER} threads=${WT} xnnpack=${WX} ===" | tee -a "$OUT"
  adb shell "${REMOTE}/android_aarch64_benchmark_model" \
    --graph="${REMOTE}/fer_mobilenetv2_96_${WINNER}.tflite" \
    --num_threads="${WT}" --use_xnnpack="${WX}" \
    --warmup_runs=50 --num_runs=200 --enable_op_profiling=false 2>&1 | tee -a "$OUT"
done

# --- 6. cleanup ---
adb shell rm -f ${REMOTE}/fer_mobilenetv2_96_*.tflite
adb shell rm -f ${REMOTE}/android_aarch64_benchmark_model
adb shell rm -f ${REMOTE}/prof_*.csv
adb shell ls ${REMOTE}/

echo "done — raw output in $OUT. Paste numbers back into notebook 08's decision table."
