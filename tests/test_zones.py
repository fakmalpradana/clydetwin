# SPDX-License-Identifier: AGPL-3.0-or-later
"""DZ2011 -> DZ2022 SIMD carry-over: area-weighted rank, dominant share and decile."""

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

from pipelines import zones


def test_decile_edges():
    assert zones.decile(pd.Series([1, 697, 698, 6976])).tolist() == [1, 1, 2, 10]


def test_simd_weighted_across_split_zone():
    z22 = gpd.GeoDataFrame(
        {"dz22": ["x", "y"]}, geometry=[box(0, 0, 10, 10), box(10, 0, 20, 10)], crs=27700
    )
    z11 = gpd.GeoDataFrame(
        {"dz11": ["p", "q"], "simd_rank": [1000, 5000]},
        geometry=[box(0, 0, 13, 10), box(13, 0, 20, 10)],
        crs=27700,
    )
    out = zones.simd_to_2022(z22, z11).set_index("dz22")
    assert out.loc["x", "simd_rank"] == 1000 and out.loc["x", "simd_dominant_share"] == 1.0
    # y is 30% p (1000) and 70% q (5000)
    assert out.loc["y", "simd_rank"] == 3800 and out.loc["y", "simd_dominant_share"] == 0.7
