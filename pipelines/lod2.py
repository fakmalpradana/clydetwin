# SPDX-License-Identifier: AGPL-3.0-or-later
"""Phase 4 LoD2 pilot: LAZ preprocessing (PDAL) and per-footprint reconstruction (roofer), both in Docker.

Steps (each skipped when its output is newer than its inputs):
  prep   -> build/pilot/footprints.gpkg, build/pilot/pc/pilot.laz
  roofer -> build/pilot/roofer/*.city.jsonl (CityJSONSeq, LoD2.2, EPSG:27700, ODN heights)
Usage: python -m pipelines.lod2 prep|roofer
"""

import json
import shutil
import subprocess
import sys

import geopandas as gpd
from shapely.geometry import box

from . import config

# Pinned tool images (digests recorded in docs/methods/lod2.md). roofer v1.0.0 is amd64-only: runs under emulation.
PDAL = "pdal/pdal@sha256:23fab8b5e89367230fae92906983355581c5dc9ec576809c098cdc50539e40d1"
ROOFER = "3dgi/roofer@sha256:dd2c415aaee337502bde0dc1426dfa9c9f88e648f9d2f6340110c49932c251d2"
BUILDING_CLASS = (
    6  # the Phase 5 LAZ only has classes 1 (unclassified) and 2 (ground); roofer wants 6 for roofs
)
MIN_HAG_M = 1.5  # unclassified points inside a footprint become 'building' only above this height over ground
CROP_BUFFER_M = 10  # ground and roof points are kept this far around the footprints


def pdir():
    d = config.ROOT / "build" / "pilot"
    d.mkdir(parents=True, exist_ok=True)
    return d


def pilot_footprints(fp: gpd.GeoDataFrame, bbox, buffer_m: float) -> gpd.GeoDataFrame:
    """Buildings whose centroid is in the pilot box and that lie wholly inside the LAZ coverage (box + buffer)."""
    inside = fp.geometry.centroid.within(box(*bbox))
    covered = fp.geometry.within(box(*bbox).buffer(buffer_m))
    return fp[inside & covered].reset_index(drop=True)


def pdal_pipeline(laz: list[str], buffered: str, bbox_buf) -> dict:
    """Merge tiles, crop, flag footprints and the crop buffer, height above ground, reclassify roofs, write LAZ."""
    gpkg = "/w/footprints.gpkg"
    return {
        "pipeline": [
            *laz,
            {"type": "filters.merge"},
            {"type": "filters.crop", "bounds": f"([{bbox_buf[0]},{bbox_buf[2]}],[{bbox_buf[1]},{bbox_buf[3]}])"},
            {"type": "filters.hag_nn"},
            {"type": "filters.overlay", "dimension": "UserData", "datasource": gpkg, "layer": "footprints", "column": "flag"},
            {"type": "filters.overlay", "dimension": "PointSourceId", "datasource": buffered, "layer": "buffer", "column": "flag"},
            {"type": "filters.range", "limits": "PointSourceId[1:1]"},
            {"type": "filters.assign", "assignment": f"Classification[0:255]={BUILDING_CLASS}", "where": f"Classification!=2 && UserData==1 && HeightAboveGround>={MIN_HAG_M}"},
            {"type": "writers.las", "filename": "/w/pc/pilot.laz", "compression": "laszip", "a_srs": "EPSG:27700"},
        ]
    }  # fmt: skip


def prep(cfg: dict) -> None:
    out = pdir()
    log = config.log
    fp = gpd.read_file(config.build_dir("aoi") / "footprints.gpkg")
    p = cfg["pilot"]
    sel = pilot_footprints(fp, p["bbox"], p["buffer_m"])
    sel["flag"] = 1
    sel.to_file(out / "footprints.gpkg", driver="GPKG", layer="footprints")
    gpd.GeoDataFrame({"flag": [1]}, geometry=[sel.union_all().buffer(CROP_BUFFER_M)], crs=27700).to_file(
        out / "buffer.gpkg", driver="GPKG", layer="buffer"
    )  # fmt: skip
    log(f"pilot footprints: {len(sel)}")
    laz = sorted((config.resolve(cfg["lidar"]["raw_dir"]) / "laz").glob("*.laz"))
    pipe = pdal_pipeline(
        [f"/laz/{f.name}" for f in laz],
        "/w/buffer.gpkg",
        box(*p["bbox"]).buffer(p["buffer_m"]).bounds,
    )
    (out / "pc").mkdir(exist_ok=True)
    (out / "pdal.json").write_text(json.dumps(pipe, indent=1))
    dst = out / "pc" / "pilot.laz"
    if config.fresh(dst, *laz, out / "footprints.gpkg", config.ROOT / "pipelines" / "lod2.py"):
        return log("pdal: up to date, skipped")
    tmp = config.partial(dst)
    pipe["pipeline"][-1]["filename"] = "/w/pc/" + tmp.name
    (out / "pdal.json").write_text(json.dumps(pipe, indent=1))
    laz_dir = config.resolve(cfg["lidar"]["raw_dir"]) / "laz"
    subprocess.run(["docker", "run", "--rm", "-v", f"{out}:/w", "-v", f"{laz_dir}:/laz:ro", PDAL, "pdal", "pipeline", "/w/pdal.json"], check=True)  # fmt: skip
    tmp.rename(dst)
    log("pdal: done")


def roofer(cfg: dict, out: str = "roofer", jobs: int = 8, **params) -> None:
    """Run roofer on the preprocessed cloud; `params` are roofer long options (e.g. complexity_factor=0.7)."""
    d, dst = pdir(), pdir() / out
    pc, fp = d / "pc" / "pilot.laz", d / "footprints.gpkg"
    done = dst / "DONE"
    if config.fresh(done, pc, fp):
        return config.log(f"roofer {out}: up to date, skipped")
    tmp = dst.with_name(out + ".partial")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    opts = [
        x
        for k, v in params.items()
        for x in (f"--{k.replace('_', '-')}", *map(str, v if isinstance(v, tuple) else (v,)))
    ]
    # roofer v1.0.0 is amd64-only; the entrypoint is the roofer binary
    subprocess.run(["docker", "run", "--rm", "--platform", "linux/amd64", "-v", f"{d}:/w", ROOFER, "--id-attribute", "building_id", "--srs", "EPSG:27700", "--compute-pc-98p", "-j", str(jobs), *opts, "/w/pc/pilot.laz", "/w/footprints.gpkg", f"/w/{tmp.name}"], check=True)  # fmt: skip
    shutil.rmtree(dst, ignore_errors=True)
    tmp.rename(dst)
    done.touch()
    config.log(f"roofer {out}: done")


if __name__ == "__main__":
    {"prep": prep, "roofer": roofer}[sys.argv[1]](config.load())
