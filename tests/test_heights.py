# SPDX-License-Identifier: AGPL-3.0-or-later
"""heights.compute on a synthetic 0.5 m nDSM/DTM: lidar height = p70, default fallback rules."""

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box

from pipelines import config, heights


def _write(path, arr):
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=arr.shape[0],
        width=arr.shape[1],
        count=1,
        dtype="float32",
        crs="EPSG:27700",
        transform=from_origin(259000, 665100, 0.5, 0.5),
        nodata=-9999,
    ) as dst:
        dst.write(arr.astype("float32"), 1)


def test_height_rules(tmp_path, monkeypatch):
    rdir = tmp_path / "raster"
    rdir.mkdir()
    nd = np.zeros((200, 200))  # 100 m x 100 m
    nd[0:40, 0:40] = 10.0  # building A: 20 m square, 10 m tall
    nd[0:40, 60:100] = 1.0  # building B: too low -> default
    nd[76:80, 60:100] = (
        5.0  # building D: 80% low ground, 20% roof at 5 m -> p70 < 2 m but p90 = 5 m
    )
    nd[100:140, 0:40] = -9999  # building C: only nodata -> default
    # exactextract interpolates between *distinct* values, so add noise to mimic real continuous data
    nd = np.where(nd == -9999, nd, nd + np.random.default_rng(0).uniform(0, 0.01, nd.shape))
    _write(rdir / "ndsm.cog.tif", nd)
    _write(rdir / "dtm.cog.tif", np.full((200, 200), 20.0))
    boxes = {
        "A": box(259000, 665080, 259020, 665100),
        "B": box(259030, 665080, 259050, 665100),
        "C": box(259000, 665030, 259020, 665050),
        "D": box(259030, 665050, 259050, 665062),
    }
    gpd.GeoDataFrame(
        {"building_id": list(boxes)}, geometry=list(boxes.values()), crs=27700
    ).to_file(tmp_path / "footprints.gpkg", driver="GPKG")
    monkeypatch.setattr(config, "build_dir", lambda mode: tmp_path)
    r = heights.compute("t").set_index("building_id")
    assert r.loc["A", "height_source"] == "lidar" and abs(r.loc["A", "height"] - 10) < 0.05
    assert r.loc["B", "height_source"] == "default" and r.loc["B", "height"] == 6.0
    assert r.loc["C", "height_source"] == "default" and r.loc["C", "valid_px_ratio"] == 0
    assert r.loc["D", "height_source"] == "lidar"
    assert r.loc["D", "h_p70"] < 2 and r.loc["D", "height"] == r.loc["D", "h_p90"] >= 2
    assert abs(r.loc["A", "ground_z_odn"] - 20) < 1e-3
    assert 50 < r.loc["A", "ground_z_ellip"] - r.loc["A", "ground_z_odn"] < 60  # geoid ~54 m
