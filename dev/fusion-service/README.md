# MaternaLink fusion HTTP wrapper (C4)

Thin FastAPI transport over `dev/fusion/` — a pure-arithmetic late-fusion
library. `dev/fusion/` is imported as an unmodified, read-only dependency;
not one line of it is edited here.

Adds no numerical behaviour. See `dev/fusion/README.md` for the fusion rule
itself.

## Endpoints

- `POST /fuse` — `{"face_evidence": {...}|null, "text_evidence": {...}|null}` → the A7 output object, verbatim (`to_contract()`).
- `GET /health` — liveness + `parameters_provenance` + `parameters_are_placeholder`.
- `GET /contract` — the library's own exported constants.

## Parameters

Six numeric parameters plus `provenance`, read once at import time from
`FUSION_W_FACE`, `FUSION_W_TEXT`, `FUSION_TAU_FACE_MIN`, `FUSION_TAU_TEXT_MIN`,
`FUSION_TAU_FUSION_MIN`, `FUSION_TAU_DISTRESS`, `FUSION_PARAM_PROVENANCE`. No
default exists for any of them — absence is a boot-time crash, naming the
missing variable (`fusion_service/params.py`).
