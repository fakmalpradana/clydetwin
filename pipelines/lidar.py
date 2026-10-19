# SPDX-License-Identifier: AGPL-3.0-or-later
"""Scottish Remote Sensing Portal (SRSP) LiDAR: catalogue search + tile / window download.

The catalogue API (api.remotesensing.data.gov.scot) is what the portal web app itself calls.
Tiles are public COGs in the S3 bucket `srsp-open-data` (no credentials).
"""

import argparse
from pathlib import Path

import geopandas as gpd
import rasterio
import requests
from rasterio.windows import from_bounds
from shapely.geometry import box

from . import config
from .download import fetch


def search(api: str, collection: str, geom_27700) -> list[dict]:
    """Return catalogue products of `collection` intersecting the geometry (EPSG:27700)."""
    wkt = gpd.GeoSeries([geom_27700], crs=27700).to_crs(4326).iloc[0].simplify(0.0005).wkt
    out, offset = [], 0
    while True:
        r = requests.post(
            f"{api}/search/product",
            json={
                "collections": [collection],
                "footprint": wkt,
                "spatialop": "intersects",
                "limit": 50,
                "offset": offset,
            },
            timeout=60,
        )
        r.raise_for_status()
        page = r.json()["result"]
        out += page
        if len(page) < 50:
            return out
        offset += 50


def product_info(p: dict) -> dict:
    http = p["data"]["product"]["http"]
    return {"ref": p["properties"]["osgbGridRef"], "url": http["url"], "size": http["size"]}


def download_tiles(cfg: dict, geom_27700, kinds=("dsm", "dtm")) -> list[Path]:
    """Download every full tile intersecting the geometry (resumable; ~400 MB each)."""
    raw = config.resolve(cfg["lidar"]["raw_dir"])
    paths = []
    for kind in kinds:
        for p in search(
            cfg["lidar"]["catalogue_api"], cfg["lidar"][f"collection_{kind}"], geom_27700
        ):
            info = product_info(p)
            print(f"{kind} {info['ref']} {info['size'] / 1e6:.0f} MB")
            paths.append(fetch(info["url"], raw / kind / Path(info["url"]).name, info["size"]))
    return paths


def download_laz(cfg: dict) -> list[Path]:
    """Pilot-area Phase 5 LAZ tiles (1 km, ~40 MB each): resumable, size-checked, sha256 in SHA256SUMS."""
    raw = config.resolve(cfg["lidar"]["raw_dir"]) / "laz"
    area = box(*cfg["pilot"]["bbox"]).buffer(cfg["pilot"]["buffer_m"])
    found = search(cfg["lidar"]["catalogue_api"], cfg["lidar"]["collection_laz"], area)
    infos = [product_info(p) for p in found]
    print(f"{len(infos)} LAZ tiles, {sum(i['size'] for i in infos) / 1e6:.0f} MB")
    return [fetch(i["url"], raw / Path(i["url"]).name, i["size"]) for i in infos]


def download_sample(cfg: dict) -> list[Path]:
    """Read only the sample bbox from the remote COG tiles (HTTP range requests, ~1 MB each)."""
    bbox = cfg["sample"]["bbox"]
    raw = config.resolve(cfg["lidar"]["raw_dir"]) / "sample"
    raw.mkdir(parents=True, exist_ok=True)
    paths = []
    for kind in ("dsm", "dtm"):
        found = search(
            cfg["lidar"]["catalogue_api"],
            cfg["lidar"][f"collection_{kind}"],
            box(*bbox).buffer(-10),
        )
        if len(found) != 1:
            raise RuntimeError(f"sample bbox must lie in exactly one {kind} tile, got {len(found)}")
        info = product_info(found[0])
        dest = raw / f"{kind}_{info['ref']}.tif"
        if not dest.exists():
            with rasterio.open(f"/vsicurl/{info['url']}") as src:
                win = from_bounds(*bbox, transform=src.transform)
                data = src.read(1, window=win)
                profile = src.profile | {
                    "driver": "GTiff",
                    "height": data.shape[0],
                    "width": data.shape[1],
                    "transform": src.window_transform(win),
                    "tiled": True,
                    "compress": "deflate",
                }
                profile.pop("blockxsize", None)
                profile.pop("blockysize", None)
                with rasterio.open(dest, "w", **profile) as dst:
                    dst.write(data, 1)
        paths.append(dest)
    return paths


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=["sample", "aoi", "laz"])
    mode = ap.parse_args().mode
    cfg = config.load()
    if mode == "laz":
        download_laz(cfg)
    elif mode == "sample":
        print(download_sample(cfg))
    else:
        aoi = gpd.read_file(config.resolve(cfg["aoi"]["path"])).geometry.iloc[0]
        download_tiles(cfg, aoi)
