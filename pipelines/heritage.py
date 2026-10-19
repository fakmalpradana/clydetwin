# SPDX-License-Identifier: AGPL-3.0-or-later
"""B6: HES listed buildings and conservation areas (OGL v3 per the HES portal terms) as per-building flags.

A building is listed when a Listed Buildings entry point lies inside its footprint, or within `heritage.lb_snap_m`
of it (HES points are accurate to 1-10 m); the highest category (A > B > C) wins. It is in a conservation area when
the footprint's representative point is inside a Conservation Areas polygon. Listed building names and addresses
are not read.
Output: part_heritage.parquet (listed bool, lb_category A|B|C|none, conservation_area bool).
"""

import zipfile

import geopandas as gpd
import pandas as pd
import pyogrio

from . import config
from .download import fetch

URLS = {
    "lb": "https://inspire.hes.scot/AtomService/DATA/lb_scotland.zip",
    "ca": "https://inspire.hes.scot/AtomService/DATA/ca_scotland.zip",
}
RANK = {"A": 3, "B": 2, "C": 1}


def listed(bld: gpd.GeoDataFrame, pts: gpd.GeoDataFrame, snap_m: float) -> pd.Series:
    """building_id -> highest listed category among entry points within snap_m of the footprint."""
    pts = pts[pts.CATEGORY.isin(RANK)]
    j = gpd.sjoin(bld[["building_id", "geometry"]], pts, predicate="dwithin", distance=snap_m)
    j["rank"] = j.CATEGORY.map(RANK)
    best = j.sort_values("rank").groupby("building_id").CATEGORY.last()
    return best


def in_areas(bld: gpd.GeoDataFrame, areas: gpd.GeoDataFrame) -> pd.Series:
    rp = gpd.GeoDataFrame(
        bld[["building_id"]], geometry=bld.geometry.representative_point(), crs=bld.crs
    )
    return rp.building_id.isin(gpd.sjoin(rp, areas[["geometry"]]).building_id)


def run(cfg: dict | None = None) -> pd.DataFrame:
    cfg = cfg or config.load()
    raw = config.resolve(cfg["analytics"]["raw_dir"]) / "hes"
    layer = {}
    for k, shp in (("lb", "lb/Listed_Buildings.shp"), ("ca", "ca/Conservation_Areas.shp")):
        z = fetch(URLS[k], raw / f"{k}_scotland.zip")
        if not (raw / shp).exists():
            zipfile.ZipFile(z).extractall(raw / k)
        layer[k] = gpd.read_file(raw / shp, bbox=tuple(bld_bounds(cfg)))
    bld = gpd.read_file(config.analytics_heights(cfg), columns=["building_id"])
    cat = listed(bld, layer["lb"], cfg["analytics"]["lb_snap_m"])
    out = pd.DataFrame({"building_id": bld.building_id})
    out["lb_category"] = out.building_id.map(cat).fillna("none")
    out["listed"] = out.lb_category != "none"
    out["conservation_area"] = in_areas(bld, layer["ca"]).values
    out.to_parquet(config.analytics_out(cfg) / "part_heritage.parquet", index=False)
    config.log(
        f"heritage: listed {out.listed.sum()} {out.lb_category.value_counts().to_dict()}, "
        f"conservation area {out.conservation_area.sum()}; LB points in AOI {len(layer['lb'])}, "
        f"CA polygons {len(layer['ca'])}"
    )
    return out


def bld_bounds(cfg):
    return pyogrio.read_info(config.analytics_heights(cfg))["total_bounds"]


if __name__ == "__main__":
    run()
