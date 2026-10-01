# SPDX-License-Identifier: AGPL-3.0-or-later
"""`make lod1`: end-to-end LoD1 pipeline. MODE=sample (one 1 km tile) or MODE=aoi (all of Glasgow City)."""

import argparse
import json

from . import aoi, config, footprints, heights, lidar, rasters, tiles


def run(mode: str) -> dict:
    cfg = config.load()
    if mode == "sample":
        lidar.download_sample(cfg)
    else:
        a = aoi.build(cfg)
        lidar.download_tiles(cfg, a.geometry.iloc[0])
    rasters.run(mode, cfg)
    footprints.build(mode, cfg)
    h = heights.compute(mode, cfg)
    n_fp = len(h) + h.attrs["dropped_no_dtm"]
    if len(h) < tiles.MIN_COMPLETENESS * n_fp:
        raise RuntimeError(f"{h.attrs['dropped_no_dtm']} of {n_fp} footprints have no DTM pixel")
    h.to_file(config.build_dir(mode) / "heights.gpkg", driver="GPKG", layer="buildings")
    n_out = tiles.run(mode)
    size = sum(
        f.stat().st_size for f in (config.build_dir(mode) / "tiles").rglob("*") if f.is_file()
    )
    stats = {
        "mode": mode,
        "footprints": n_fp,
        "dropped_no_dtm": h.attrs["dropped_no_dtm"],
        "in_tileset": n_out,
        "pct_default": round(100 * float((h.height_source == "default").mean()), 2),
        "tileset_bytes": size,
    }
    (config.build_dir(mode) / "stats.json").write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats, indent=2))
    return stats


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=["sample", "aoi"])
    run(ap.parse_args().mode)
