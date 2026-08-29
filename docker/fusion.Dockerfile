# MaternaLink fusion service image.
#
# Placed OUTSIDE dev/fusion/ deliberately — that directory is imported as an
# unmodified, read-only dependency (C4_PLAN.md absolute prohibition 1). This
# file only copies from it; not one line of dev/fusion/ is edited.
#
# Fusion is pure Python stdlib arithmetic (dev/fusion/README.md) — no pins to
# carry, unlike the FER/sentiment images. The six fusion parameters are
# injected at container START as environment variables (see docker-compose.yml
# / .env.example), never baked into this image — no ENV line here sets any of
# them, and none may (§7A.7).

FROM python:3.11.15-slim@sha256:90744cff8f32887f075c47d747a173ff333e9e98801667af93c357fa9f5e28ff

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY dev/fusion-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# The wrapper's own transport code.
COPY dev/fusion-service/app.py ./app.py
COPY dev/fusion-service/fusion_service ./fusion_service

# dev/fusion/ — the library this wraps. Copied read-only in spirit (never
# modified by this build); imported as `fusion` from /app.
COPY dev/fusion/fusion ./fusion

# Off in production — detail strings must never reach an untrusted caller.
ENV FUSION_DEBUG=0

EXPOSE 9000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000"]
