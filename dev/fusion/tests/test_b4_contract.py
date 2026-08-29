"""pytest wrapper over b4_checks.py — one test per F-check.

Run:  python -m pytest dev/fusion/tests/test_b4_contract.py -v

The checks themselves live in b4_checks.py so that tools/run_b4_contract.py
(which emits the artifacts) asserts exactly the same behaviour.
"""

from __future__ import annotations

import pytest

from b4_checks import CHECKS, f13_weight_sensitivity_sweep


@pytest.mark.parametrize("fid,desc,fn", CHECKS, ids=[c[0] for c in CHECKS])
def test_contract_check(fid, desc, fn):
    result = fn()
    assert "spec_clause" in result and result["spec_clause"]


def test_f13_weight_sensitivity_sweep_runs():
    out = f13_weight_sensitivity_sweep()
    assert out["rows"], "sweep produced no rows"
    assert len(out["w_values"]) == 21, out["w_values"]
    # every row has a valid fused state and a distribution
    for row in out["rows"]:
        assert row["fused_state"] in ("calm", "neutral", "distressed", "unknown")
        total = row["fused_calm"] + row["fused_neutral"] + row["fused_distressed"]
        assert abs(total - 1.0) < 1e-6, (row, total)
