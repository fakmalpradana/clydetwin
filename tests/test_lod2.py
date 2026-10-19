# SPDX-License-Identifier: AGPL-3.0-or-later
"""LoD2 pilot helpers: footprint selection and the PDAL pipeline contract."""

import geopandas as gpd
from shapely.geometry import box

from pipelines import lod2


def test_pilot_footprints_keep_centroid_inside_and_lidar_covered():
    bbox = (0, 0, 100, 100)
    fp = gpd.GeoDataFrame(
        {"building_id": ["in", "edge", "far", "outside"]},
        geometry=[box(10, 10, 20, 20), box(90, 90, 120, 120), box(95, 95, 400, 400), box(500, 500, 510, 510)],
        crs=27700,
    )  # fmt: skip
    # 'edge' centroid (105,105) is outside the box; 'far' centroid is outside; only 'in' qualifies
    assert list(lod2.pilot_footprints(fp, bbox, 25).building_id) == ["in"]
    fp.loc[1, "geometry"] = box(
        80, 80, 110, 110
    )  # centroid (95, 95) inside, extent within box + 25
    assert list(lod2.pilot_footprints(fp, bbox, 25).building_id) == ["in", "edge"]


def test_pdal_pipeline_reclassifies_only_footprint_roofs():
    p = lod2.pdal_pipeline(["/laz/a.laz"], "/w/buffer.gpkg", (0, 0, 10, 10))["pipeline"]
    assign = [s for s in p if not isinstance(s, str) and s["type"] == "filters.assign"]
    assert len(assign) == 1 and f"={lod2.BUILDING_CLASS}" in assign[0]["assignment"]
    assert "UserData==1" in assign[0]["where"] and "Classification!=2" in assign[0]["where"]
    assert p[-1]["type"] == "writers.las" and p[-1]["compression"] == "laszip"
