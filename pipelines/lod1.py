# SPDX-License-Identifier: AGPL-3.0-or-later
"""`make lod1`: end-to-end LoD1 pipeline. MODE=sample (one 1 km tile) or MODE=aoi (all of Glasgow City)."""

import argparse
import json

import geopandas as gpd

from . import aoi, config, footprints, heights, lidar, rasters, tiles


def run(mode: str) -> dict:
    cfg = config.load()
    log = config.log
    bdir = config.build_dir(mode)
    log(f"lod1 {mode}: start")
    if mode == "sample":
        lidar.download_sample(cfg)
    else:
        a = aoi.build(cfg)
        lidar.download_tiles(cfg, a.geometry.iloc[0])
    log("lidar: ready")
    rasters.run(mode, cfg)
    log("rasters: ready")
    fp_path, h_path = bdir / "footprints.gpkg", bdir / "heights.gpkg"
    raster_dir = bdir / "raster"
    fp_zip = config.resolve(cfg["os"]["raw_dir"])
    if not config.fresh(
        fp_path, *fp_zip.glob("opmplc_*.zip"), config.ROOT / "pipelines" / "footprints.py"
    ):
        footprints.build(mode, cfg)
    n_fp = len(gpd.read_file(fp_path, columns=[]))
    log(f"footprints: {n_fp}")
    h_inputs = [fp_path, *raster_dir.glob("*.cog.tif"), config.ROOT / "pipelines" / "heights.py",
                config.ROOT / "pipelines" / "datum.py", config.ROOT / "pipelines" / "config.yaml"]  # fmt: skip
    if config.fresh(h_path, *h_inputs):
        log("heights: up to date, skipped")
    else:
        h = heights.compute(mode, cfg)
        dropped = h.attrs["dropped_no_dtm"]
        if len(h) < tiles.MIN_COMPLETENESS * n_fp:
            raise RuntimeError(f"{dropped} of {n_fp} footprints have no DTM pixel")
        tmp = config.partial(h_path)
        h.to_file(tmp, driver="GPKG", layer="buildings")
        tmp.rename(h_path)
        log(f"heights: {len(h)} rows ({dropped} dropped, no DTM)")
    h = gpd.read_file(h_path, columns=["height_source"])
    n_out = tiles.run(mode)
    tdir = bdir / "tiles"
    files = [f for f in tdir.rglob("*") if f.is_file()]
    stats = {
        "mode": mode,
        "footprints": n_fp,
        "dropped_no_dtm": n_fp - len(h),
        "in_tileset": n_out,
        "pct_default": round(100 * float((h.height_source == "default").mean()), 2),
        "tile_count": len(list(tdir.rglob("content/*.glb"))),
        "tileset_bytes": sum(f.stat().st_size for f in files),
    }
    (bdir / "stats.json").write_text(json.dumps(stats, indent=2))
    log(json.dumps(stats))
    return stats


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=["sample", "aoi"])
    run(ap.parse_args().mode)
