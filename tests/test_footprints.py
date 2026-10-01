# SPDX-License-Identifier: AGPL-3.0-or-later
"""Multipolygon footprints are exploded to one row per part with unique ids."""

import geopandas as gpd
from shapely.geometry import MultiPolygon, box

from pipelines import config, footprints, os_data


def test_multipolygons_are_exploded(tmp_path, monkeypatch):
    two = MultiPolygon([box(0, 0, 1, 1), box(5, 5, 6, 6)])
    src = gpd.GeoDataFrame({"ID": ["a", "b"]}, geometry=[two, box(10, 10, 11, 11)], crs=27700)
    shp_dir = tmp_path / "oml" / "OS OpenMap Local (ESRI Shape File) NS" / "data"
    shp_dir.mkdir(parents=True)
    src.to_file(shp_dir / "NS_Building.shp")
    monkeypatch.setattr(os_data, "openmap_local", lambda cfg: tmp_path / "oml")
    monkeypatch.setattr(config, "build_dir", lambda mode: tmp_path)
    cfg = config.load()
    cfg["sample"]["bbox"] = [-1, -1, 20, 20]
    g = footprints.build("sample", cfg)
    assert sorted(g.building_id) == ["a-0", "a-1", "b"]
    assert (g.geom_type == "Polygon").all()
