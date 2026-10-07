# SPDX-License-Identifier: AGPL-3.0-or-later
import pandas as pd

from pipelines import attrs


def test_storeys_heuristic():
    s = attrs.storeys(pd.Series([2.0, 3.0, 4.4, 7.5, 70.6]), 3.0)
    assert s.tolist() == [1, 1, 1, 2, 24]  # at least one storey, nearest whole number


def test_built_contract_domains():
    import pytest

    from pipelines import config

    p = config.resolve("build/analytics/buildings_attrs.parquet")
    if not p.exists():
        pytest.skip("buildings_attrs.parquet not built")
    d = pd.read_parquet(p)
    assert d.building_id.is_unique
    for c in ("flood_river", "flood_coastal", "flood_surface", "flood_max"):
        assert set(d[c].dropna()) <= {"none", "low", "medium", "high"}
    assert set(d.lb_category.dropna()) <= {"A", "B", "C", "none"}
    assert set(d.epc_rating.dropna()) <= set("ABCDEFG")
    assert d.storeys_est.min() >= 1 and (d.volume_m3 > 0).all()
