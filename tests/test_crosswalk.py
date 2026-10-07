# SPDX-License-Identifier: AGPL-3.0-or-later
"""UPRN -> building matching: inside wins, near points snap, far points drop, overlaps pick the smaller footprint."""

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, box

from pipelines import crosswalk


def test_match_and_per_building():
    bld = gpd.GeoDataFrame(
        {"building_id": ["a", "b", "big"], "area_m2": [100.0, 100.0, 400.0]},
        geometry=[box(0, 0, 10, 10), box(20, 0, 30, 10), box(-5, -5, 15, 15)],
        crs=27700,
    )
    pts = gpd.GeoDataFrame(
        {"UPRN": [1, 2, 3, 4]},
        geometry=[Point(5, 5), Point(31, 5), Point(500, 500), Point(25, 5)],
        crs=27700,
    )
    m = crosswalk.match(pts, bld, 2.0).set_index("UPRN")
    assert m.building_id.to_dict() == {1: "a", 2: "b", 4: "b"}  # 3 is too far; overlaps -> smaller
    assert m.dist_m[2] == 1.0 and m.dist_m[1] == 0.0
    xw = m.reset_index().assign(toid=["t1", "t1", "t2"])
    pb = crosswalk.per_building(xw).set_index("building_id")
    assert pb.loc["b", ["n_uprn", "n_toid"]].tolist() == [2, 2]
    assert pb.loc["a", "toid"] == "t1"
    assert pd.api.types.is_integer_dtype(pb.n_uprn)
