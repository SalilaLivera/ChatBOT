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
#
# ⛔⛔ TWO-STAGE BUILD — READ BEFORE TOUCHING `ARG HF_TOKEN` BELOW ⛔⛔
#
# Railway's build infrastructure does NOT support BuildKit secret mounts
# (`RUN --mount=type=secret`) — confirmed live, 2026-08-30:
#   "dockerfile invalid: flag '--mount=type=secret,id=hf_token' is missing
#    a type=cache argument (other mount types are not supported)"
# That was this file's original mechanism (still the correct one for any
# builder that DOES support it — e.g. `docker build --secret` locally) but
# it cannot run on Railway at all, so it cannot be the only path.
#
# This two-stage layout is the fallback for builders without secret-mount
# support. `HF_TOKEN` is an `ARG`, scoped ONLY to the `fetch-model` stage
# below via Docker's per-stage ARG scoping (an ARG declared after one FROM
# is invisible to every later FROM unless redeclared, and it is never
# redeclared in the runtime stage). Only the resulting FILE crosses into
# the runtime stage, via `COPY --from=fetch-model` — not the ARG, not the
# RUN command that used it, not that stage's layer history.
#
# ⛔ HONEST TRADEOFF, NOT CLAIMED EQUIVALENT TO A SECRET MOUNT: the token
# IS written to disk, in plaintext, inside `fetch-model`'s build layers —
# on Railway, that means it transiently exists in Railway's OWN build
# cache for that discarded stage, not just locally. A true secret mount
# never touches disk in plaintext at all. This is a real, smaller-but-real
# exposure surface a secret mount would have closed. Accepted deliberately
# (owner decision, 2026-08-30) because Railway leaves no alternative that
# keeps HF_TOKEN out of Git, out of the repo, and out of the FINAL runtime
# image — which this design still guarantees.
FROM python:3.11.15-slim@sha256:90744cff8f32887f075c47d747a173ff333e9e98801667af93c357fa9f5e28ff AS fetch-model

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /fetch

# ⛔ Scoped to THIS stage only — see the block comment above. Never printed,
# never echoed, never written to a file other than as part of the
# Authorization header of one outbound HTTPS request.
ARG HF_TOKEN

# model.safetensors (266 MB) is NOT committed (*.safetensors is gitignored
# project-wide) and does not exist on a fresh clone (Railway or otherwise) —
# fetched here from the PRIVATE Hugging Face archive
# mykkularathne/maternalink-sinbert-mood3-archive.
RUN curl -fsSL \
        -H "Authorization: Bearer ${HF_TOKEN}" \
        -o model.safetensors \
        https://huggingface.co/mykkularathne/maternalink-sinbert-mood3-archive/resolve/main/model.safetensors

# ⛔ Verified INSIDE the fetch stage, BEFORE the runtime stage ever sees the
# file — a wrong/tampered download never reaches COPY --from=fetch-model
# below. This build-time check mirrors fer.Dockerfile's existing pattern;
# the runtime check in sentiment_service/inference.py (CHECKPOINT_SHA256)
# is UNCHANGED and remains the actual safety net either way.
ARG EXPECTED_CHECKPOINT_SHA256=624da0651206746aa211a9fe472280a488effb75f4ef230f933d565688a965b9
RUN echo "${EXPECTED_CHECKPOINT_SHA256}  model.safetensors" | sha256sum -c -

# ═══════════════════════════════════════════════════════════════════════
# Runtime stage — fresh FROM, no ARG HF_TOKEN here, no trace of it below.
# ═══════════════════════════════════════════════════════════════════════
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

# ⛔ FILE ONLY — not the ARG, not the RUN history, not the fetch stage's
# layers. This is the one line that crosses the stage boundary.
COPY --from=fetch-model /fetch/model.safetensors ./checkpoint/model.safetensors

ENV SENTIMENT_CHECKPOINT_DIR=/app/checkpoint
# Off in production — detail strings must never reach an untrusted caller.
ENV SENTIMENT_DEBUG=0

EXPOSE 8000

# uvicorn CLI, explicit --host 0.0.0.0: never executes app.py's __main__ block,
# so the 127.0.0.1 default in app.py is never in play.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
