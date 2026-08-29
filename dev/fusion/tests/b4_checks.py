"""F1-F13 contract-conformance checks for the B4 mood fusion layer.

Single source of truth. ``test_b4_contract.py`` runs these under pytest;
``tools/run_b4_contract.py`` runs them to emit the artifacts. Each check cites
the MOOD_STATE_SPEC.md / FUSION_B4_PLAN.md clause it asserts against.

Nothing here validates fusion ACCURACY. No dataset pairs a face and a Sinhala
message from the same person at the same moment with a ground-truth mood label,
so there is no macro-F1, accuracy, or confusion matrix to compute. Every
parameter used below is a PLACEHOLDER FOR TESTING, not a measured value.
"""

from __future__ import annotations

import sys
from pathlib import Path

_PKG_ROOT = Path(__file__).resolve().parents[1]
if str(_PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(_PKG_ROOT))

from fusion import (  # noqa: E402
    FUSION_VERSION,
    SUBSTANTIVE_STATES,
    TESTING_PLACEHOLDER_PROVENANCE,
    ContractViolationError,
    FusionParameters,
    InvalidParameterError,
    MissingParameterError,
    MissingProvenanceError,
    argmax_state,
    fuse,
)

# --------------------------------------------------------------------------
# Synthetic evidence builders — SYNTHETIC, documented, not real FER/Dev-v2 data
# --------------------------------------------------------------------------


def face_evidence(calm, neutral, distressed, *, confidence=None, model_version="fer-test/0.0.0"):
    """A synthetic A4 face-modality evidence object.

    Scores must sum to 1 (A4). ``confidence`` defaults to the top score.
    """
    scores = {"calm": calm, "neutral": neutral, "distressed": distressed}
    return {
        "scores": scores,
        "predicted_state": argmax_state(scores),
        "confidence": max(scores.values()) if confidence is None else confidence,
        "model_version": model_version,
    }


def text_evidence(
    calm,
    neutral,
    distressed,
    *,
    confidence=None,
    language="si",
    model_version="sinbert-test/0.0.0",
):
    """A synthetic A4 text-modality evidence object (carries ``language``, A4)."""
    ev = face_evidence(calm, neutral, distressed, confidence=confidence, model_version=model_version)
    ev["language"] = language
    return ev


def placeholder_params(
    *,
    W_face=0.5,
    tau_face_min=0.0,
    tau_text_min=0.0,
    tau_fusion_min=0.0,
    tau_distress=0.5,
):
    """Fully-specified parameters for testing ONLY.

    provenance is the mandated placeholder string. W_face here is itself a
    placeholder; F13 sweeps it precisely because its real value is undecided.
    """
    return FusionParameters.require(
        W_face=W_face,
        W_text=round(1.0 - W_face, 10),
        tau_face_min=tau_face_min,
        tau_text_min=tau_text_min,
        tau_fusion_min=tau_fusion_min,
        tau_distress=tau_distress,
        provenance=TESTING_PLACEHOLDER_PROVENANCE,
    )


# --------------------------------------------------------------------------
# F1 - parameters absent -> construction FAILS with a typed error
# --------------------------------------------------------------------------
def f1_parameters_absent_fails():
    clause = "FUSION_B4_PLAN.md section 2 / MOOD_STATE_SPEC.md A7 (no default weighting)"
    outcomes = []

    # nothing at all
    try:
        FusionParameters.require()
        raise AssertionError("FusionParameters.require() with no args must raise")
    except MissingParameterError as e:
        assert "W_face" in str(e), str(e)
        outcomes.append(("no args -> MissingParameterError naming W_face", str(e.message)))

    # each single symbol missing in turn
    full = dict(
        W_face=0.5,
        W_text=0.5,
        tau_face_min=0.1,
        tau_text_min=0.1,
        tau_fusion_min=0.1,
        tau_distress=0.5,
        provenance=TESTING_PLACEHOLDER_PROVENANCE,
    )
    for symbol in ("W_face", "W_text", "tau_face_min", "tau_text_min", "tau_fusion_min", "tau_distress"):
        kwargs = {k: v for k, v in full.items() if k != symbol}
        try:
            FusionParameters.require(**kwargs)
            raise AssertionError(f"missing {symbol} must raise MissingParameterError")
        except MissingParameterError as e:
            assert symbol in str(e), f"error for missing {symbol} must name it: {e}"
            outcomes.append((f"missing {symbol} -> MissingParameterError", str(e.message)))

    # provenance missing
    kwargs = {k: v for k, v in full.items() if k != "provenance"}
    try:
        FusionParameters.require(**kwargs)
        raise AssertionError("missing provenance must raise")
    except MissingProvenanceError as e:
        outcomes.append(("missing provenance -> MissingProvenanceError", str(e.message)))

    # cannot bypass require() by hitting the dataclass with junk provenance
    try:
        FusionParameters(0.5, 0.5, 0.1, 0.1, 0.1, 0.5, provenance="")
        raise AssertionError("empty provenance must raise even via the dataclass")
    except MissingProvenanceError:
        outcomes.append(("dataclass with empty provenance -> MissingProvenanceError", ""))

    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F2 - W_face + W_text != 1 -> rejected
# --------------------------------------------------------------------------
def f2_weights_must_sum_to_one():
    clause = "MOOD_STATE_SPEC.md A7: 'subject to W_face + W_text = 1'"
    outcomes = []
    for wf, wt in ((0.5, 0.6), (0.5, 0.4), (0.0, 0.0), (1.0, 1.0), (0.7, 0.7)):
        try:
            FusionParameters.require(
                W_face=wf,
                W_text=wt,
                tau_face_min=0.1,
                tau_text_min=0.1,
                tau_fusion_min=0.1,
                tau_distress=0.5,
                provenance=TESTING_PLACEHOLDER_PROVENANCE,
            )
            raise AssertionError(f"W_face={wf} + W_text={wt} != 1 must be rejected")
        except InvalidParameterError as e:
            outcomes.append((f"W_face={wf}, W_text={wt} -> InvalidParameterError", str(e.detail)))

    # the boundary case that MUST be accepted
    p = FusionParameters.require(
        W_face=0.5,
        W_text=0.5,
        tau_face_min=0.1,
        tau_text_min=0.1,
        tau_fusion_min=0.1,
        tau_distress=0.5,
        provenance=TESTING_PLACEHOLDER_PROVENANCE,
    )
    assert abs(p.W_face + p.W_text - 1.0) < 1e-9
    outcomes.append(("W_face=0.5, W_text=0.5 -> accepted", ""))
    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F3 - all four A6 rows: correct state and modalities_used
# --------------------------------------------------------------------------
def f3_a6_table_all_rows():
    clause = "MOOD_STATE_SPEC.md A6 missing-modality table (all four rows)"
    p = placeholder_params(W_face=0.5, tau_face_min=0.5, tau_text_min=0.5, tau_fusion_min=0.0)
    rows = []

    # row 1: face usable + text usable -> fused, ["face","text"]
    r = fuse(
        face_evidence(0.1, 0.2, 0.7, confidence=0.9),
        text_evidence(0.6, 0.3, 0.1, confidence=0.9),
        p,
    )
    assert r.modalities_used == ("face", "text"), r.modalities_used
    assert r.state in SUBSTANTIVE_STATES
    rows.append(("usable + usable", r.state, list(r.modalities_used), "fused"))

    # row 2: face unusable (below tau) + text usable -> text unchanged, ["text"]
    face_bad = face_evidence(0.8, 0.1, 0.1, confidence=0.2)  # below tau_face_min 0.5
    txt = text_evidence(0.1, 0.2, 0.7, confidence=0.9)
    r = fuse(face_bad, txt, p)
    assert r.modalities_used == ("text",), r.modalities_used
    assert r.state == "distressed", r.state
    assert r.scores == {s: txt["scores"][s] for s in SUBSTANTIVE_STATES}, r.scores
    rows.append(("unusable + usable", r.state, list(r.modalities_used), "text passthrough"))

    # row 2 variant: face entirely absent (None) + text usable
    r = fuse(None, txt, p)
    assert r.modalities_used == ("text",)
    rows.append(("absent + usable", r.state, list(r.modalities_used), "text passthrough"))

    # row 3: face usable + text unusable (below tau) -> face unchanged, ["face"]
    face_ok = face_evidence(0.1, 0.2, 0.7, confidence=0.9)
    txt_bad = text_evidence(0.9, 0.05, 0.05, confidence=0.2)
    r = fuse(face_ok, txt_bad, p)
    assert r.modalities_used == ("face",), r.modalities_used
    assert r.state == "distressed", r.state
    assert r.scores == {s: face_ok["scores"][s] for s in SUBSTANTIVE_STATES}
    rows.append(("usable + unusable", r.state, list(r.modalities_used), "face passthrough"))

    # row 3 variant: text absent (None)
    r = fuse(face_ok, None, p)
    assert r.modalities_used == ("face",)
    rows.append(("usable + absent", r.state, list(r.modalities_used), "face passthrough"))

    # row 4: both unusable -> unknown, []
    r = fuse(face_bad, txt_bad, p)
    assert r.state == "unknown", r.state
    assert r.modalities_used == (), r.modalities_used
    rows.append(("unusable + unusable", r.state, list(r.modalities_used), "unknown"))

    # row 4 variant: both absent
    r = fuse(None, None, p)
    assert r.state == "unknown" and r.modalities_used == ()
    rows.append(("absent + absent", r.state, list(r.modalities_used), "unknown"))

    return {"spec_clause": clause, "detail": rows}


# --------------------------------------------------------------------------
# F4 - single-modality passthrough is UNWEIGHTED
# --------------------------------------------------------------------------
def f4_passthrough_is_unweighted():
    clause = (
        "MOOD_STATE_SPEC.md A7: 'When only one modality is usable, that modality's "
        "scores pass through unchanged; the weights do not apply.'"
    )
    outcomes = []
    # deliberately lopsided weights so a weighting bug would show
    for W_face in (0.5, 0.1, 0.9, 0.0, 1.0):
        p = placeholder_params(W_face=W_face, tau_face_min=0.5, tau_text_min=0.5, tau_fusion_min=0.0)

        face_in = face_evidence(0.2, 0.3, 0.5, confidence=0.9)
        r = fuse(face_in, text_evidence(0.9, 0.05, 0.05, confidence=0.1), p)  # text unusable
        assert r.modalities_used == ("face",)
        for s in SUBSTANTIVE_STATES:
            assert r.scores[s] == face_in["scores"][s], (W_face, s, r.scores, face_in["scores"])
        assert r.confidence == face_in["confidence"], (W_face, r.confidence)

        text_in = text_evidence(0.5, 0.3, 0.2, confidence=0.85)
        r = fuse(face_evidence(0.05, 0.05, 0.9, confidence=0.1), text_in, p)  # face unusable
        assert r.modalities_used == ("text",)
        for s in SUBSTANTIVE_STATES:
            assert r.scores[s] == text_in["scores"][s], (W_face, s)
        assert r.confidence == text_in["confidence"]

        outcomes.append(
            (f"W_face={W_face}: face-only & text-only scores byte-identical to input; conf unchanged", "")
        )
    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F5 - all four A5 unknown conditions produce "unknown"
# --------------------------------------------------------------------------
def f5_a5_unknown_conditions():
    clause = "MOOD_STATE_SPEC.md A5: `unknown` when and only when no modality result is usable"
    outcomes = []
    p = placeholder_params(W_face=0.5, tau_face_min=0.5, tau_text_min=0.5, tau_fusion_min=0.6)

    # (1) camera disabled/unavailable + text unusable
    r = fuse(None, text_evidence(0.9, 0.05, 0.05, confidence=0.1), p)
    assert r.state == "unknown" and r.modalities_used == ()
    outcomes.append(("camera unavailable + text below tau", r.state))

    # (2) both present but both below their confidence thresholds
    r = fuse(
        face_evidence(0.8, 0.1, 0.1, confidence=0.2),
        text_evidence(0.1, 0.1, 0.8, confidence=0.2),
        p,
    )
    assert r.state == "unknown" and r.modalities_used == ()
    outcomes.append(("both below tau", r.state))

    # (3) both modalities failing/erroring (represented as None per A6)
    r = fuse(None, None, p)
    assert r.state == "unknown" and r.modalities_used == ()
    outcomes.append(("both erroring/absent", r.state))

    # (4) fused confidence below tau_fusion_min
    # both usable, but the fused top score < 0.6
    r = fuse(
        face_evidence(0.4, 0.35, 0.25, confidence=0.9),
        text_evidence(0.25, 0.4, 0.35, confidence=0.9),
        p,
    )
    assert r.state == "unknown", (r.state, r.reason)
    assert r.reason == "a5_fused_confidence_below_tau_fusion_min"
    assert r.modalities_used == ()
    outcomes.append(("fused confidence below tau_fusion_min", r.state))

    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F6 - "unknown" is never produced when any modality is usable
# --------------------------------------------------------------------------
def f6_unknown_never_when_a_modality_usable():
    clause = "MOOD_STATE_SPEC.md A5: `unknown` produced when AND ONLY WHEN no modality is usable"
    # tau_fusion_min = 0 so the only path to unknown is 'no usable modality'
    checked = 0
    for W_face in [i / 20 for i in range(21)]:
        p = placeholder_params(W_face=W_face, tau_face_min=0.3, tau_text_min=0.3, tau_fusion_min=0.0)
        for fc in ((0.7, 0.2, 0.1), (0.1, 0.8, 0.1), (0.2, 0.2, 0.6), (0.34, 0.33, 0.33)):
            for tc in ((0.6, 0.3, 0.1), (0.2, 0.2, 0.6), (0.1, 0.7, 0.2)):
                for face_present in (True, False):
                    for text_present in (True, False):
                        if not face_present and not text_present:
                            continue
                        f_ev = face_evidence(*fc, confidence=0.9) if face_present else None
                        t_ev = text_evidence(*tc, confidence=0.9) if text_present else None
                        r = fuse(f_ev, t_ev, p)
                        # at least one modality is usable here (conf 0.9 >= 0.3, si)
                        assert r.state != "unknown", (W_face, fc, tc, face_present, text_present, r.reason)
                        assert r.modalities_used, r
                        checked += 1
    return {"spec_clause": clause, "detail": [(f"{checked} usable-modality combinations, none returned unknown", "")]}


# --------------------------------------------------------------------------
# F7 - output matches A7 exactly - no extra fields, none missing
# --------------------------------------------------------------------------
def f7_output_matches_a7_exactly():
    clause = "MOOD_STATE_SPEC.md A7 output contract: {state, confidence, modalities_used, fusion_version}"
    expected = {"state", "confidence", "modalities_used", "fusion_version"}
    p = placeholder_params(W_face=0.5, tau_face_min=0.4, tau_text_min=0.4, tau_fusion_min=0.5)
    samples = [
        (face_evidence(0.1, 0.2, 0.7, confidence=0.9), text_evidence(0.6, 0.3, 0.1, confidence=0.9)),
        (face_evidence(0.1, 0.2, 0.7, confidence=0.9), None),
        (None, text_evidence(0.6, 0.3, 0.1, confidence=0.9)),
        (None, None),
        (face_evidence(0.4, 0.35, 0.25, confidence=0.9), text_evidence(0.25, 0.4, 0.35, confidence=0.9)),
    ]
    outcomes = []
    for f_ev, t_ev in samples:
        out = fuse(f_ev, t_ev, p).to_contract()
        assert set(out.keys()) == expected, set(out.keys())
        assert out["fusion_version"] == FUSION_VERSION == "fusion-v1"
        assert out["state"] in ("calm", "neutral", "distressed", "unknown")
        assert isinstance(out["confidence"], float) and 0.0 <= out["confidence"] <= 1.0
        assert isinstance(out["modalities_used"], list)
        assert all(m in ("face", "text") for m in out["modalities_used"])
        outcomes.append((str({k: out[k] for k in ("state", "modalities_used")}), ""))
    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F8 - score order is always calm, neutral, distressed
# --------------------------------------------------------------------------
def f8_score_order_fixed():
    clause = "MOOD_STATE_SPEC.md A4: class order fixed as calm, neutral, distressed"
    assert SUBSTANTIVE_STATES == ("calm", "neutral", "distressed")
    p = placeholder_params(W_face=0.5, tau_face_min=0.0, tau_text_min=0.0, tau_fusion_min=0.0)
    outcomes = []
    for f_ev, t_ev in [
        (face_evidence(0.1, 0.2, 0.7, confidence=0.9), text_evidence(0.6, 0.3, 0.1, confidence=0.9)),
        (face_evidence(0.1, 0.2, 0.7, confidence=0.9), None),
        (None, text_evidence(0.6, 0.3, 0.1, confidence=0.9)),
    ]:
        r = fuse(f_ev, t_ev, p)
        assert tuple(r.scores.keys()) == ("calm", "neutral", "distressed"), tuple(r.scores.keys())
        outcomes.append((str(tuple(r.scores.keys())), ""))
    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F9 - fused scores sum to 1, each in [0,1]
# --------------------------------------------------------------------------
def f9_fused_scores_valid_distribution():
    clause = "MOOD_STATE_SPEC.md A4: scores are a probability-like vector over the three states"
    checked = 0
    worst = 0.0
    for W_face in [i / 20 for i in range(21)]:
        p = placeholder_params(W_face=W_face, tau_face_min=0.0, tau_text_min=0.0, tau_fusion_min=0.0)
        for fc in ((0.7, 0.2, 0.1), (0.1, 0.8, 0.1), (0.2, 0.2, 0.6), (0.34, 0.33, 0.33)):
            for tc in ((0.6, 0.3, 0.1), (0.2, 0.2, 0.6), (0.1, 0.7, 0.2), (0.33, 0.34, 0.33)):
                r = fuse(face_evidence(*fc, confidence=0.9), text_evidence(*tc, confidence=0.9), p)
                total = sum(r.scores.values())
                worst = max(worst, abs(total - 1.0))
                assert abs(total - 1.0) < 1e-9, (W_face, fc, tc, total)
                for v in r.scores.values():
                    assert 0.0 <= v <= 1.0, v
                checked += 1
    return {"spec_clause": clause, "detail": [(f"{checked} fused vectors; max |sum-1| = {worst:.2e}", "")]}


# --------------------------------------------------------------------------
# F10 - predicted_state == argmax of fused scores
# --------------------------------------------------------------------------
def f10_state_is_argmax():
    clause = "MOOD_STATE_SPEC.md A4: predicted_state is the argmax of scores"
    checked = 0
    for W_face in [i / 20 for i in range(21)]:
        p = placeholder_params(W_face=W_face, tau_face_min=0.0, tau_text_min=0.0, tau_fusion_min=0.0)
        for fc in ((0.7, 0.2, 0.1), (0.1, 0.8, 0.1), (0.2, 0.2, 0.6)):
            for tc in ((0.6, 0.3, 0.1), (0.2, 0.2, 0.6), (0.1, 0.7, 0.2)):
                r = fuse(face_evidence(*fc, confidence=0.9), text_evidence(*tc, confidence=0.9), p)
                manual = max(r.scores, key=lambda k: (r.scores[k], -SUBSTANTIVE_STATES.index(k)))
                # tie-break: first in fixed order; recompute the spec way
                manual = argmax_state(r.scores)
                assert r.state == manual, (r.scores, r.state, manual)
                assert abs(r.confidence - r.scores[r.state]) < 1e-12
                checked += 1
    return {"spec_clause": clause, "detail": [(f"{checked} fused vectors; state == argmax and confidence == top score", "")]}


# --------------------------------------------------------------------------
# F11 - non-Sinhala language -> text unusable regardless of confidence
# --------------------------------------------------------------------------
def f11_non_sinhala_text_unusable():
    clause = (
        "FUSION_B4_PLAN.md section 5.1 / B2-A section 4: if language is not Sinhala the "
        "text evidence is not usable regardless of confidence"
    )
    p = placeholder_params(W_face=0.5, tau_face_min=0.4, tau_text_min=0.3, tau_fusion_min=0.0)
    outcomes = []
    for lang in ("en", "en-US", "English", "ta", "hi", "", "  "):
        # very confident English 'CALM' - the exact B2-A hazard shape
        t_ev = None
        try:
            t_ev = text_evidence(0.66, 0.2, 0.14, confidence=0.66, language=lang)
        except Exception:
            pass
        if lang.strip() == "":
            # empty language is a contract violation, tested in F12; skip here
            continue
        # with a usable face -> must route to face-only, NOT fuse
        face_ok = face_evidence(0.1, 0.1, 0.8, confidence=0.9)
        r = fuse(face_ok, t_ev, p)
        assert r.modalities_used == ("face",), (lang, r.modalities_used)
        assert r.state == "distressed", (lang, r.state)
        # with no face -> unknown, NOT a confident CALM
        r2 = fuse(None, t_ev, p)
        assert r2.state == "unknown", (lang, r2.state)
        outcomes.append((f"language={lang!r}, conf=0.66 -> text discarded (face-only / unknown)", ""))

    # control: Sinhala at the same confidence IS usable
    r = fuse(None, text_evidence(0.66, 0.2, 0.14, confidence=0.66, language="si"), p)
    assert r.modalities_used == ("text",) and r.state == "calm"
    outcomes.append(("control language='si', conf=0.66 -> text used", ""))
    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F12 - missing `language` on text evidence -> contract violation raised
# --------------------------------------------------------------------------
def f12_missing_language_is_contract_violation():
    clause = (
        "MOOD_STATE_SPEC.md A4 (text carries `language`) / FUSION_B4_PLAN.md 5.1 "
        "(absent language must raise, never default to 'probably Sinhala')"
    )
    p = placeholder_params(W_face=0.5, tau_face_min=0.4, tau_text_min=0.3, tau_fusion_min=0.0)
    outcomes = []

    bad = face_evidence(0.6, 0.3, 0.1, confidence=0.9)  # a dict with NO 'language'
    try:
        fuse(face_evidence(0.1, 0.1, 0.8, confidence=0.9), bad, p)
        raise AssertionError("text evidence without 'language' must raise ContractViolationError")
    except ContractViolationError as e:
        assert "language" in str(e.detail), e.detail
        outcomes.append(("text dict missing 'language' key -> ContractViolationError", str(e.detail)))

    for junk_lang in (None, 123, "", "   "):
        ev = face_evidence(0.6, 0.3, 0.1, confidence=0.9)
        ev["language"] = junk_lang
        try:
            fuse(None, ev, p)
            raise AssertionError(f"language={junk_lang!r} must raise")
        except ContractViolationError as e:
            outcomes.append((f"language={junk_lang!r} -> ContractViolationError", str(e.detail)))
    return {"spec_clause": clause, "detail": outcomes}


# --------------------------------------------------------------------------
# F13 - WEIGHT SENSITIVITY sweep  (NOT validation)
# --------------------------------------------------------------------------

#: SYNTHETIC evidence pairs. Constructed by hand to span the interesting cases;
#: NOT drawn from FER-2013 or Dev-v2. Each is (name, face_scores, text_scores).
#: face confidence and text confidence are both fixed high so both modalities
#: are always usable across the whole sweep and only W_face moves.
F13_PAIRS = [
    # face and text agree on distressed - expect no flip
    ("agree_distressed", (0.10, 0.20, 0.70), (0.15, 0.15, 0.70)),
    # face and text agree on calm - expect no flip
    ("agree_calm", (0.70, 0.20, 0.10), (0.65, 0.25, 0.10)),
    # direct conflict: face says distressed, text says calm - expect a flip
    ("conflict_face_distress_text_calm", (0.05, 0.15, 0.80), (0.80, 0.15, 0.05)),
    # milder conflict: face distressed, text neutral
    ("conflict_face_distress_text_neutral", (0.20, 0.20, 0.60), (0.20, 0.65, 0.15)),
    # face neutral, text distressed - the FER-distress-miss shape (final scoring 2)
    ("conflict_face_neutral_text_distress", (0.25, 0.55, 0.20), (0.15, 0.20, 0.65)),
    # near-uniform face, decisive text calm
    ("weak_face_strong_text_calm", (0.34, 0.33, 0.33), (0.75, 0.15, 0.10)),
    # decisive face calm, near-uniform text
    ("strong_face_calm_weak_text", (0.75, 0.15, 0.10), (0.34, 0.33, 0.33)),
    # three-way: face calm, text distressed, neutral is the fused middle ground
    ("face_calm_text_distress_symmetric", (0.60, 0.25, 0.15), (0.15, 0.25, 0.60)),
]


def f13_weight_sensitivity_sweep(step=0.05):
    clause = (
        "FUSION_B4_PLAN.md section 6/7 (F13): sweep W_face 0->1, record where the fused "
        "state flips. This is planning input for Phase 7, NOT validation."
    )
    n = int(round(1.0 / step))
    w_values = [round(i * step, 10) for i in range(n + 1)]
    rows = []  # dicts for CSV
    flips = []  # summary per pair

    for name, fc, tc in F13_PAIRS:
        face_ev = face_evidence(*fc, confidence=0.95)
        text_ev = text_evidence(*tc, confidence=0.95, language="si")
        prev_state = None
        pair_flip_points = []
        for w in w_values:
            p = FusionParameters.require(
                W_face=w,
                W_text=round(1.0 - w, 10),
                tau_face_min=0.0,
                tau_text_min=0.0,
                tau_fusion_min=0.0,  # isolate the weighting effect; no unknown gate
                tau_distress=0.5,
                provenance=TESTING_PLACEHOLDER_PROVENANCE,
            )
            r = fuse(face_ev, text_ev, p)
            rows.append(
                {
                    "pair": name,
                    "W_face": w,
                    "W_text": round(1.0 - w, 10),
                    "face_scores": "|".join(f"{x:.2f}" for x in fc),
                    "text_scores": "|".join(f"{x:.2f}" for x in tc),
                    "fused_calm": round(r.scores["calm"], 6),
                    "fused_neutral": round(r.scores["neutral"], 6),
                    "fused_distressed": round(r.scores["distressed"], 6),
                    "fused_state": r.state,
                    "fused_confidence": round(r.confidence, 6),
                }
            )
            if prev_state is not None and r.state != prev_state:
                pair_flip_points.append((prev_state, r.state, w))
            prev_state = r.state
        flips.append(
            {
                "pair": name,
                "state_at_W_face_0": rows[-(n + 1)]["fused_state"],
                "state_at_W_face_1": rows[-1]["fused_state"],
                "flip_points": pair_flip_points,
                "n_flips": len(pair_flip_points),
            }
        )
    return {"spec_clause": clause, "rows": rows, "flips": flips, "w_values": w_values}


# --------------------------------------------------------------------------
# registry
# --------------------------------------------------------------------------
CHECKS = [
    ("F1", "parameters absent -> construction fails with a typed error", f1_parameters_absent_fails),
    ("F2", "W_face + W_text != 1 -> rejected", f2_weights_must_sum_to_one),
    ("F3", "all four A6 rows: correct state and modalities_used", f3_a6_table_all_rows),
    ("F4", "single-modality passthrough is UNWEIGHTED", f4_passthrough_is_unweighted),
    ("F5", "all four A5 unknown conditions produce 'unknown'", f5_a5_unknown_conditions),
    ("F6", "'unknown' never produced when any modality is usable", f6_unknown_never_when_a_modality_usable),
    ("F7", "output matches A7 exactly", f7_output_matches_a7_exactly),
    ("F8", "score order is always calm, neutral, distressed", f8_score_order_fixed),
    ("F9", "fused scores sum to 1, each in [0,1]", f9_fused_scores_valid_distribution),
    ("F10", "predicted_state == argmax of fused scores", f10_state_is_argmax),
    ("F11", "non-Sinhala language -> text unusable regardless of confidence", f11_non_sinhala_text_unusable),
    ("F12", "missing language on text evidence -> contract violation", f12_missing_language_is_contract_violation),
]
