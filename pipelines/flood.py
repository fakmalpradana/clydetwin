# SPDX-License-Identifier: AGPL-3.0-or-later
"""B3 / X3: flood exposure per building from the SEPA Flood Maps v3.0 (OGL v3).

River and coastal extents (3 likelihood layers each) come from the Flood_Maps MapServer, queried once per layer for
the AOI envelope and cached under data/raw/analytics/flood/. Surface water and small watercourses extents are the
published SEPA download (file geodatabase, 1.9 GB, read with a bbox filter). A building is exposed to a source at
the highest likelihood whose extent intersects its footprint: high (about 1 in 10 yr), medium (1 in 200), low
(1 in 1000), else none.
Output: part_flood.parquet (flood_river, flood_coastal, flood_surface, flood_max: none|low|medium|high).
"""

import subprocess
import time

import geopandas as gpd
import pandas as pd
import requests

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


def hit(bld: gpd.GeoDataFrame, ext: gpd.GeoDataFrame) -> pd.Series:
    ids = set(bld.sjoin(ext[["geometry"]], predicate="intersects").building_id) if len(ext) else ()
    return bld.building_id.isin(ids)


def surface(bld: gpd.GeoDataFrame, raw, bbox) -> pd.Series:
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
        hits.append(hit(bld, gpd.read_file(f)))
        config.log(f"surface water {k}: {int(hits[-1].sum())} buildings")
    return classify(*hits).set_axis(bld.index)


def run(cfg: dict | None = None) -> pd.DataFrame:
    cfg = cfg or config.load()
    raw = config.resolve(cfg["analytics"]["raw_dir"]) / "flood"
    bld = gpd.read_file(config.analytics_heights(cfg), columns=["building_id"])
    bbox = tuple(bld.total_bounds.round())
    out = pd.DataFrame({"building_id": bld.building_id})
    for src, layers in SOURCES.items():
        h, m, lo = (hit(bld, fetch_layer(i, bbox, raw)) for i in layers)
        out[f"flood_{src}"] = classify(h, m, lo).values
    out["flood_surface"] = surface(bld, raw, bbox).values
    out["flood_max"] = worst(out.flood_river, out.flood_coastal, out.flood_surface).values
    out.to_parquet(config.analytics_out(cfg) / "part_flood.parquet", index=False)
    for c in out.columns[1:]:
        config.log(f"{c}: {out[c].value_counts().to_dict()}")
    return out


if __name__ == "__main__":
    run()
