# SPDX-License-Identifier: AGPL-3.0-or-later
"""Flood exposure classing: likelihood precedence and worst-of-sources."""

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

from pipelines import flood


def test_flood_classify_precedence_and_worst():
    h = pd.Series([True, False, False, False])
    m = pd.Series([True, True, False, False])
    lo = pd.Series([True, True, True, False])
    assert flood.classify(h, m, lo).tolist() == ["high", "medium", "low", "none"]
    a, b = pd.Series(["none", "low"]), pd.Series(["medium", "none"])
    assert flood.worst(a, b).tolist() == ["medium", "low"]


def test_share_and_min_share_threshold():
    bld = gpd.GeoDataFrame(
        geometry=[box(0, 0, 10, 10), box(20, 0, 30, 10), box(40, 0, 50, 10)], crs=27700
    )
    ext = gpd.GeoDataFrame(
        geometry=[box(-5, -5, 5, 20), box(29, 0, 35, 10)], crs=27700
    )  # 50%, 10%, 0
    s = flood.share(bld, ext, (0, 0, 50, 20), res=1)
    assert s.round(2).tolist() == [0.5, 0.1, 0.0]
    none = pd.Series([0.0, 0.0, 0.0])
    cls, top = flood.exposure((none, s, s), 0.10)
    assert cls.tolist() == ["medium", "medium", "none"] and top.tolist() == [0.5, 0.1, 0.0]
    cls, _ = flood.exposure((none, none, s), 0.25)
    assert cls.tolist() == ["low", "none", "none"]
