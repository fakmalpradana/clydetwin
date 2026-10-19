# SPDX-License-Identifier: AGPL-3.0-or-later
"""Roof-vs-DSM residuals on synthetic CityJSONSeq features and a synthetic DSM."""

import json

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from pipelines import lod2_qa as q


def _dsm(path, fn):
    xs = 0.25 + 0.5 * np.arange(40)  # 20 m square, 0.5 m pixels, x 0..20, y 0..20
    x, y = np.meshgrid(xs, xs)
    z = fn(x, y).astype("float32")
    with rasterio.open(path, "w", driver="GTiff", height=40, width=40, count=1, dtype="float32",
                       transform=from_origin(0, 20, 0.5, 0.5), nodata=-9999, crs=27700) as dst:  # fmt: skip
        dst.write(z[::-1], 1)  # row 0 is the top (north)
    return path


def _feature(zs):
    """One building, one solid with a single RoofSurface square (4..16 m) at heights zs (corner order)."""
    xyz = [(4, 4, zs[0]), (16, 4, zs[1]), (16, 16, zs[2]), (4, 16, zs[3])]
    return {
        "id": "b1",
        "xyz": np.array(xyz, float),
        "CityObjects": {
            "b1-0": {
                "geometry": [
                    {
                        "lod": "2.2",
                        "boundaries": [[[[0, 1, 2, 3]]]],
                        "semantics": {"surfaces": [{"type": "RoofSurface"}], "values": [[0]]},
                    }
                ]
            }  # fmt: skip
        },
    }


def test_flat_roof_matches_dsm(tmp_path):
    dsm = _dsm(tmp_path / "d.tif", lambda x, y: 10 + 0 * x)
    s = q.summarise(q.roof_rmse([_feature([10] * 4)], dsm))
    assert s["rmse_m"] == pytest.approx(0, abs=1e-6)


def test_offset_gives_rmse_and_bias(tmp_path):
    dsm = _dsm(tmp_path / "d.tif", lambda x, y: 10.5 + 0 * x)  # DSM 0.5 m above the model
    s = q.summarise(q.roof_rmse([_feature([10] * 4)], dsm))
    assert s["rmse_m"] == pytest.approx(0.5) and s["bias_m"] == pytest.approx(-0.5)


def test_sloped_roof_plane(tmp_path):
    dsm = _dsm(tmp_path / "d.tif", lambda x, y: 5 + 0.5 * x)  # slopes along x
    s = q.summarise(q.roof_rmse([_feature([7, 13, 13, 7])], dsm))  # 5 + .5*4 = 7 at x=4, 13 at x=16
    assert s["rmse_m"] == pytest.approx(0, abs=1e-5)


def test_read_cjseq_applies_transform(tmp_path):
    p = tmp_path / "a.city.jsonl"
    head = {"type": "CityJSON", "transform": {"scale": [0.001] * 3, "translate": [100, 200, 0]}}
    p.write_text(json.dumps(head) + "\n" + json.dumps({"id": "x", "CityObjects": {}, "vertices": [[1000, 2000, 3000]]}) + "\n")  # fmt: skip
    assert q.read_cjseq(p)[0]["xyz"].tolist() == [[101.0, 202.0, 3.0]]


def test_diff_stats():
    import pandas as pd

    s = q.diff_stats(pd.Series([10.0, 12.0, 20.0]), pd.Series([10.0, 10.0, 18.0]))
    assert s["n"] == 3 and s["bias_m"] == pytest.approx(4 / 3) and s["median_abs_m"] == 2.0
