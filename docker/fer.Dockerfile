# MaternaLink FER service image.
#
# Placed OUTSIDE dev/fer-service/ deliberately — that directory is a certified
# artifact (A1/A2) and is never modified. This file only copies from it.
#
# Pin discipline (standing rule 2): ai-edge-litert==2.2.0 (1.2.0 fails to import
# on glibc >= 2.41) and Pillow==11.3.0 (bit-identical preprocessing, certified)
# are load-bearing by measurement. Never relaxed.

FROM python:3.11.15-slim@sha256:90744cff8f32887f075c47d747a173ff333e9e98801667af93c357fa9f5e28ff

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY dev/fer-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Assert the resolved pins match what was certified.
RUN python -c "\
import ai_edge_litert, PIL; \
assert ai_edge_litert.__version__ == '2.2.0', f'ai-edge-litert {ai_edge_litert.__version__} != 2.2.0'; \
assert PIL.__version__ == '11.3.0', f'Pillow {PIL.__version__} != 11.3.0'; \
print('pin assertion OK:', ai_edge_litert.__version__, PIL.__version__)"

# Application source — certified, unmodified.
COPY dev/fer-service/app.py ./app.py
COPY dev/fer-service/fer_service ./fer_service

# The model. NOT committed to git (*.tflite is gitignored project-wide,
# see .gitignore's "Model artifacts — weights and exports are rebuildable")
# and NOT baked into this image from the host — fetched from the PUBLIC
# Hugging Face model repo at build time instead, so a fresh clone (Railway
# or otherwise) can build this image without a pre-placed local file.
#
# ⛔ The SHA-256 verification below is UNCHANGED from before this fetch
# existed — it is the actual safety net, not the download. A wrong or
# tampered file fails this check exactly as it always did; the download
# mechanism is not trusted on its own. ARG still lets a scratch build pass
# a deliberately wrong hash to prove the check fails.
#
# No HF_TOKEN needed — mykkularathne/maternalink-fer-mobilenetv2 is public.
ARG EXPECTED_TFLITE_SHA256=47b3adcc0ce769afa469ec6dd272e2561263863ab73621a449fcc1340e958c8c
RUN mkdir -p ./models && \
    curl -fsSL \
        -o ./models/fer_mobilenetv2_96_float32.tflite \
        https://huggingface.co/mykkularathne/maternalink-fer-mobilenetv2/resolve/main/fer_mobilenetv2_96_float32.tflite
RUN echo "${EXPECTED_TFLITE_SHA256}  ./models/fer_mobilenetv2_96_float32.tflite" | sha256sum -c -

# The service's own startup SHA check stays enabled (fer_service/inference.py) —
# belt and braces, not disabled here.
ENV FER_DEBUG=0

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
