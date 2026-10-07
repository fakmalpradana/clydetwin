# SPDX-License-Identifier: AGPL-3.0-or-later
"""B3 / X3: flood exposure per building from the SEPA Flood Maps v3.0 (OGL v3).

River and coastal extents (3 likelihood layers each) come from the Flood_Maps MapServer, queried once per layer for
the AOI envelope and cached under data/raw/analytics/flood/. Surface water and small watercourses extents are the
published SEPA download (file geodatabase, 1.9 GB, read with a bbox filter). A building is exposed to a source at
the highest likelihood whose extent intersects its footprint: high (about 1 in 10 yr), medium (1 in 200), low
(1 in 1000), else none.
A building is exposed to a likelihood only if at least `analytics.flood_min_share` of its footprint area lies in that extent.
Output: part_flood.parquet (flood_river, flood_coastal, flood_surface, flood_max: none|low|medium|high; flood_share_max 0-1).
"""

import subprocess
import time

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from exactextract import exact_extract
from rasterio.features import rasterize
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from . import config
from .download import fetch

MAPSERVER = "https://map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer"
SOURCES = {"river": (0, 1, 2), "coastal": (6, 7, 8)}  # MapServer layers: high, medium, low
SW_ZIP = "https://map.sepa.org.uk/atom/flood/SEPA_Surface_Water_Flood_Maps_EXTENT_v3_0.zip"
SW_GDB = "FRM_Surface_Water_Flood_Hazard_EXTENT_Layers_v3_0.gdb"
ORDER = ["none", "low", "medium", "high"]


def classify(hit_high, hit_medium, hit_low) -> pd.Series:
    """Highest intersected likelihood class from three boolean series."""
    return pd.Series(
        [
            "high" if h else "medium" if m else "low" if lo else "none"
            for h, m, lo in zip(hit_high, hit_medium, hit_low, strict=True)
        ],
        index=getattr(hit_high, "index", None),
    )


def worst(*cols: pd.Series) -> pd.Series:
    return pd.concat(cols, axis=1).apply(lambda r: max(r, key=ORDER.index), axis=1)


def fetch_layer(layer: int, bbox, cache) -> gpd.GeoDataFrame:
    """All features of a MapServer layer intersecting bbox (EPSG:27700), paged and cached as GeoJSON."""
    f = cache / f"mapserver_{layer}.geojson"
    if not f.exists():
        feats, off = [], 0
        while True:
            r = requests.get(
                f"{MAPSERVER}/{layer}/query",
                params={
                    "geometry": ",".join(map(str, bbox)),
                    "geometryType": "esriGeometryEnvelope",
                    "inSR": 27700,
                    "outSR": 27700,
                    "spatialRel": "esriSpatialRelIntersects",
                    "outFields": "PROB",
                    "resultOffset": off,
                    "resultRecordCount": 1000,
                    "f": "geojson",
                },
                timeout=300,
            )
            r.raise_for_status()
            page = r.json()["features"]
            feats += page
            if len(page) < 1000:
                break
            off += 1000
            time.sleep(2)
        cache.mkdir(parents=True, exist_ok=True)
        f.write_text(pd.io.json.ujson_dumps({"type": "FeatureCollection", "features": feats}))
        time.sleep(2)
    g = gpd.read_file(f)
    return g.set_crs(27700, allow_override=True) if len(g) else g


def share(bld: gpd.GeoDataFrame, ext: gpd.GeoDataFrame, bbox, res: float = 2.0) -> pd.Series:
    """Fraction (0-1) of each footprint covered by the extent polygons, aligned to bld.index.

    The extent is rasterized once over the AOI at `res` m (uint8) and exactextract takes the coverage-weighted mean per
    footprint, so partial pixels count fractionally; at 2 m the error is well below the 10% threshold. Vector
    intersection against 100k+ vertex polygons took minutes per layer.
    """
    if not len(ext):
        return pd.Series(0.0, index=bld.index)
    x0, y0, x1, y1 = bbox
    shape = (int(np.ceil((y1 - y0) / res)), int(np.ceil((x1 - x0) / res)))
    tf = from_origin(x0, y0 + shape[0] * res, res, res)
    arr = rasterize(
        ext.geometry, out_shape=shape, transform=tf, fill=0, default_value=1, dtype="uint8"
    )
    prof = dict(
        driver="GTiff",
        height=shape[0],
        width=shape[1],
        count=1,
        dtype="uint8",
        crs=27700,
        transform=tf,
    )
    with MemoryFile() as mf:
        with mf.open(**prof) as dst:
            dst.write(arr, 1)
        with mf.open() as src:
            r = exact_extract(src, bld[["geometry"]], ["mean"], output="pandas")
    return pd.Series(r["mean"].fillna(0).clip(0, 1).values, index=bld.index)


def exposure(shares, min_share: float) -> tuple[pd.Series, pd.Series]:
    """(class, share in the class's extent) from the high, medium, low share series; a class needs >= min_share."""
    h, m, lo = (s >= min_share for s in shares)
    cls = classify(h, m, lo)
    top = pd.Series(0.0, index=shares[0].index)
    for name, s in zip(("high", "medium", "low"), shares, strict=True):
        top = top.where(cls != name, s)
    return cls, top.round(3)


def surface(bld: gpd.GeoDataFrame, raw, bbox) -> tuple[pd.Series, ...]:
    """Surface water and small watercourses from the unpacked geodatabase.

    ogr2ogr clips each layer to the AOI in under a second; reading the GDB through geopandas with a bbox took hours.
    """
    z = fetch(SW_ZIP, raw / "sw_extent.zip")
    gdb = (
        raw / "sw" / "Data" / SW_GDB
    )  # 13 GB unpacked: a bbox read straight from the zip is far too slow
    if not gdb.exists():
        subprocess.run(["unzip", "-o", "-q", str(z), "Data/*", "-d", str(raw / "sw")], check=True)
    hits = []
    for k in "HML":
        f = raw / f"sw_{k}.gpkg"
        if not f.exists():
            spat = [str(int(v)) for v in bbox]
            layer = f"FRM_FH_SURFACE_WATER_EXTENT_{k}"
            subprocess.run(
                ["ogr2ogr", "-f", "GPKG", str(f), str(gdb), layer, "-spat", *spat], check=True
            )
        hits.append(share(bld, gpd.read_file(f), bbox))
    return tuple(hits)


def run(cfg: dict | None = None) -> pd.DataFrame:
    cfg = cfg or config.load()
    raw = config.resolve(cfg["analytics"]["raw_dir"]) / "flood"
    bld = gpd.read_file(config.analytics_heights(cfg), columns=["building_id"])
    bbox = tuple(bld.total_bounds.round())
    min_share = cfg["analytics"]["flood_min_share"]
    out = pd.DataFrame({"building_id": bld.building_id})
    tops = []
    for src, layers in SOURCES.items():
        shares = tuple(share(bld, fetch_layer(i, bbox, raw), bbox) for i in layers)
        out[f"flood_{src}"], top = exposure(shares, min_share)
        tops.append(top)
    out["flood_surface"], top = exposure(surface(bld, raw, bbox), min_share)
    tops.append(top)
    out["flood_max"] = worst(out.flood_river, out.flood_coastal, out.flood_surface).values
    # share of the footprint in the extent that set flood_max (largest among sources at that class)
    cls = out[["flood_river", "flood_coastal", "flood_surface"]]
    out["flood_share_max"] = pd.concat(
        [t.where(cls[c] == out.flood_max, 0.0) for t, c in zip(tops, cls.columns, strict=True)],
        axis=1,
    ).max(axis=1)
    out.loc[out.flood_max == "none", "flood_share_max"] = 0.0
    out.to_parquet(config.analytics_out(cfg) / "part_flood.parquet", index=False)
    for c in out.columns[1:]:
        config.log(f"{c}: {out[c].value_counts().to_dict()}")
    return out


if __name__ == "__main__":
    run()
