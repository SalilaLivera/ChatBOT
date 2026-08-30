# syntax=docker/dockerfile:1
#
# The `syntax` directive above is required for the `RUN --mount=type=secret`
# instruction below (BuildKit secret mounts) — it is not a version bump of
# anything certified in this file, only the Dockerfile frontend itself.
#
# MaternaLink sentiment service image.
#
# Placed OUTSIDE dev/sentiment-service/ deliberately — that directory is a
# certified artifact (B1/B2-A) and is never modified, not even to add a
# Dockerfile inside it. This file only copies from it.
#
# The 127.0.0.1 bind trap (dev/sentiment-service/app.py:195) is solved here,
# in CMD, by invoking the uvicorn CLI directly — that never executes the
# `if __name__ == "__main__"` block in app.py, so app.py is untouched.
#
# Pin discipline (standing rule 2): torch==2.13.0 (CPU build), transformers==5.15.1,
# tokenizers==0.22.2, numpy==2.4.6 are load-bearing by measurement (B1 parity,
# max abs diff 4.47e-07, 76/76 argmax). Never relaxed.

FROM python:3.11.15-slim@sha256:90744cff8f32887f075c47d747a173ff333e9e98801667af93c357fa9f5e28ff

WORKDIR /app

# --no-install-recommends keeps the image lean; this is a service image, not a dev box.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY dev/sentiment-service/b1-constraints.txt ./b1-constraints.txt
COPY dev/sentiment-service/requirements.txt ./requirements.txt

# torch from the CPU index — omitting --index-url pulls the multi-gigabyte CUDA
# build, which is not what B1 certified.
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple \
        -c b1-constraints.txt \
        -r requirements.txt

# Assert the resolved pins match what was certified. Fail the build if not —
# a build that cannot satisfy a pin is reported, never fixed by relaxing it.
RUN python -c "\
import torch, transformers, tokenizers, numpy; \
assert torch.__version__ == '2.13.0+cpu', f'torch {torch.__version__} != 2.13.0+cpu'; \
assert transformers.__version__ == '5.15.1', f'transformers {transformers.__version__} != 5.15.1'; \
assert tokenizers.__version__ == '0.22.2', f'tokenizers {tokenizers.__version__} != 0.22.2'; \
assert numpy.__version__ == '2.4.6', f'numpy {numpy.__version__} != 2.4.6'; \
print('pin assertion OK:', torch.__version__, transformers.__version__, tokenizers.__version__, numpy.__version__)"

# Application source — certified, unmodified.
COPY dev/sentiment-service/app.py ./app.py
COPY dev/sentiment-service/sentiment_service ./sentiment_service

# The checkpoint (4 files — weights without tokenizer.json will not load).
#
# config.json / tokenizer.json / tokenizer_config.json ARE committed to git
# (small, non-binary) — copied from the host exactly as before, unchanged.
COPY ml/sentiment/outputs/development_v2/experiment_02/best_checkpoint/config.json \
     ml/sentiment/outputs/development_v2/experiment_02/best_checkpoint/tokenizer.json \
     ml/sentiment/outputs/development_v2/experiment_02/best_checkpoint/tokenizer_config.json \
     ./checkpoint/

# model.safetensors (266 MB) is NOT committed (*.safetensors is gitignored
# project-wide) and does not exist on a fresh clone (Railway or otherwise) —
# fetched here from the PRIVATE Hugging Face archive
# mykkularathne/maternalink-sinbert-mood3-archive instead.
#
# ⛔ HF_TOKEN is a BuildKit SECRET, never an ARG/ENV — it is never written to
# any image layer, never appears in `docker history`, and is not baked into
# this Dockerfile. It must be supplied to `docker build` as
# `--secret id=hf_token,env=HF_TOKEN` (or Railway's equivalent build-secret
# mechanism); the build fails if it is absent, since the repo is private.
#
# ⛔ The runtime SHA-256 check in sentiment_service/inference.py is UNCHANGED
# by this — it is still the actual safety net; this download is only trusted
# because that check exists. The build-time check below is an ADDITION
# (fail fast at build time, mirroring fer.Dockerfile's existing pattern),
# not a replacement for it.
ARG EXPECTED_CHECKPOINT_SHA256=624da0651206746aa211a9fe472280a488effb75f4ef230f933d565688a965b9
RUN --mount=type=secret,id=hf_token \
    curl -fsSL \
        -H "Authorization: Bearer $(cat /run/secrets/hf_token)" \
        -o ./checkpoint/model.safetensors \
        https://huggingface.co/mykkularathne/maternalink-sinbert-mood3-archive/resolve/main/model.safetensors
RUN echo "${EXPECTED_CHECKPOINT_SHA256}  ./checkpoint/model.safetensors" | sha256sum -c -

ENV SENTIMENT_CHECKPOINT_DIR=/app/checkpoint
# Off in production — detail strings must never reach an untrusted caller.
ENV SENTIMENT_DEBUG=0

EXPOSE 8000

# uvicorn CLI, explicit --host 0.0.0.0: never executes app.py's __main__ block,
# so the 127.0.0.1 default in app.py is never in play.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
