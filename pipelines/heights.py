# SPDX-License-Identifier: AGPL-3.0-or-later
"""Task 1.6 + 1.7: per-building heights from the nDSM and ground levels from the DTM.

LoD1 height = h_p70 of nDSM inside the footprint (3DBAG convention). Buildings without usable LiDAR
(no valid pixels, or both h_p70 and h_p90 below min_height_m) get the default height and `height_source = 'default'`.
Ground z is the DTM 10th percentile (ODN) and its ETRS89 ellipsoidal equivalent via OSGM15.
"""

import geopandas as gpd
import numpy as np
import rasterio
from exactextract import exact_extract

from . import config
from .datum import odn_to_ellipsoidal


def _extract(raster: str, gdf: gpd.GeoDataFrame, ops: list[str]):
    with rasterio.open(raster) as src:
        return exact_extract(
            src, gdf[["building_id", "geometry"]], ops, include_cols="building_id", output="pandas"
        )


def compute(mode: str, cfg: dict | None = None) -> gpd.GeoDataFrame:
    cfg = cfg or config.load()
    h = cfg["heights"]
    rdir = config.build_dir(mode) / "raster"
    fp = gpd.read_file(config.build_dir(mode) / "footprints.gpkg")

    n = _extract(
        str(rdir / "ndsm.cog.tif"),
        fp,
        ["quantile(q=0.5)", "quantile(q=0.7)", "quantile(q=0.9)", "max", "count"],
    ).set_index("building_id")
    d = _extract(str(rdir / "dtm.cog.tif"), fp, ["quantile(q=0.1)"]).set_index("building_id")

    out = fp.set_index("building_id")
    out["area_m2"] = out.geometry.area
    out["h_p50"], out["h_p70"] = n["quantile_50"], n["quantile_70"]
    out["h_p90"], out["h_max"] = n["quantile_90"], n["max"]
    px_area = 0.25  # 0.5 m LiDAR pixels
    out["valid_px_ratio"] = np.clip(n["count"] / (out["area_m2"] / px_area), 0, 1)
    out["ground_z_odn"] = d["quantile_10"]

    # h_p70 normally; small footprints that only partly overlap a roof (p70 < min but p90 >= min) use h_p90.
    # max is never used: it picks up neighbouring towers and cranes at footprint edges.
    use_p70 = out["h_p70"] >= h["min_height_m"]
    use_p90 = ~use_p70 & (out["h_p90"] >= h["min_height_m"])
    out["height_source"] = np.where(use_p70 | use_p90, "lidar", "default")
    out["height"] = np.select(
        [use_p70, use_p90], [out["h_p70"], out["h_p90"]], h["default_height_m"]
    )
    out["lidar_year"] = cfg["lidar"]["year"]

    # Buildings with no DTM pixel (e.g. on nodata voids) cannot be placed: dropped and counted.
    missing = out["ground_z_odn"].isna()
    out = out[~missing].copy()
    c = out.geometry.centroid
    _, _, out["ground_z_ellip"] = odn_to_ellipsoidal(
        c.x.values, c.y.values, out["ground_z_odn"].values
    )
    out.attrs["dropped_no_dtm"] = int(missing.sum())
    return out.reset_index()


if __name__ == "__main__":
    import sys

    mode = sys.argv[1] if len(sys.argv) > 1 else "sample"
    g = compute(mode)
    g.to_file(config.build_dir(mode) / "heights.gpkg", driver="GPKG", layer="buildings")
    print(len(g), g.height_source.value_counts().to_dict(), "dropped:", g.attrs["dropped_no_dtm"])
    print(g.drop(columns="geometry").describe().T)
