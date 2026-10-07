# SPDX-License-Identifier: AGPL-3.0-or-later
import geopandas as gpd
from shapely.geometry import Point, box

from pipelines import heritage


def test_listed_highest_category_and_snap():
    bld = gpd.GeoDataFrame(
        {"building_id": ["a", "b", "c"]},
        geometry=[box(0, 0, 10, 10), box(20, 0, 30, 10), box(50, 0, 60, 10)],
        crs=27700,
    )
    pts = gpd.GeoDataFrame(
        {"CATEGORY": ["C", "A", "B", "A"]},
        geometry=[Point(5, 5), Point(9, 9), Point(32, 5), Point(44, 5)],
        crs=27700,
    )
    cat = heritage.listed(bld, pts, 5.0)
    assert cat.to_dict() == {
        "a": "A",
        "b": "B",
    }  # b: 2 m outside, snapped; c: 6 m away, not snapped


def test_conservation_area_by_representative_point():
    bld = gpd.GeoDataFrame(
        {"building_id": ["in", "out"]},
        geometry=[box(0, 0, 10, 10), box(100, 0, 110, 10)],
        crs=27700,
    )
    ca = gpd.GeoDataFrame(geometry=[box(-5, -5, 50, 50)], crs=27700)
    assert heritage.in_areas(bld, ca).tolist() == [True, False]
