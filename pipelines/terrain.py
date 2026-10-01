# SPDX-License-Identifier: AGPL-3.0-or-later
"""Item 7: own terrain. DTM (ODN) -> ~2 m ETRS89 raster with ellipsoidal heights (OSGM15) -> quantized-mesh.

Cesium World Terrain sits ~14 m above the LiDAR ground in central Glasgow, so buildings with correct
ellipsoidal bases look sunk. This builds terrain from the same DTM and the same geoid as the buildings.
Needs GDAL CLI (gdalwarp, gdal_fillnodata.py) and docker (tumgis/ctb-quantized-mesh).
Output: build/<mode>/terrain/ (layer.json + {z}/{x}/{y}.terrain).
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window

from . import config, datum

NODATA = -9999.0
RES = (3.2e-5, 1.8e-5)  # degrees lon, lat: about 2 m at Glasgow (56 N)
PAD_M = 2000  # edge padding, filled by nearest-value extrapolation so the terrain does not drop at the AOI edge
CTB_IMAGE = "tumgis/ctb-quantized-mesh"


def _run(*cmd) -> None:
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"{cmd[0]} failed:\n{r.stdout}{r.stderr}")


def _extent_4326(vrt: Path) -> tuple[float, float, float, float]:
    with rasterio.open(vrt) as s:
        west, south, east, north = s.bounds
    tr = Transformer.from_crs(27700, 4326, always_xy=True)
    xs, ys = tr.transform([west, east, west, east], [south, south, north, north])
    pad_lat, pad_lon = PAD_M / 111_000, PAD_M / 62_000
    # snap to the raster grid so the DTM and geoid warps share pixels
    lon0 = np.floor((min(xs) - pad_lon) / RES[0]) * RES[0]
    lat0 = np.floor((min(ys) - pad_lat) / RES[1]) * RES[1]
    lon1 = np.ceil((max(xs) + pad_lon) / RES[0]) * RES[0]
    lat1 = np.ceil((max(ys) + pad_lat) / RES[1]) * RES[1]
    return lon0, lat0, lon1, lat1


def ellipsoidal_raster(mode: str) -> Path:
    cfg_dir = config.build_dir(mode)
    vrt = cfg_dir / "raster" / "dtm.vrt"
    out = cfg_dir / "terrain_ellip.tif"
    if config.fresh(out, vrt):
        return out
    datum.ensure_grids()
    te = _extent_4326(vrt)
    common = ["-t_srs", "EPSG:4326", "-te", *te, "-tr", *RES, "-ot", "Float32", "-overwrite"]
    work = cfg_dir / "terrain_work"
    work.mkdir(exist_ok=True)
    dtm, geoid, filled = work / "dtm_odn.tif", work / "geoid.tif", work / "dtm_filled.tif"
    config.log("terrain: warp DTM to 4326 ~2 m")
    _run("gdalwarp", *common, "-r", "average", "-srcnodata", NODATA, "-dstnodata", NODATA,
         "-multi", "-wo", "NUM_THREADS=ALL_CPUS", "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE",
         "-co", "BIGTIFF=YES", vrt, dtm)  # fmt: skip
    config.log("terrain: fill voids / padding")
    _run("gdal_fillnodata.py", "-md", "1500", "-si", "0", "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE",
         "-co", "BIGTIFF=YES", dtm, filled)  # fmt: skip
    config.log("terrain: sample OSGM15 geoid")
    _run("gdalwarp", *common, "-r", "bilinear", "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE",
         config.resolve("data/proj/uk_os_OSGM15_GB.tif"), geoid)  # fmt: skip
    config.log("terrain: ellipsoidal height = ODN + geoid")
    tmp = config.partial(out)
    with rasterio.open(filled) as a, rasterio.open(geoid) as g:
        prof = a.profile | {"driver": "GTiff", "compress": "deflate", "BIGTIFF": "YES"}
        with rasterio.open(tmp, "w", **prof) as dst:
            for r in range(0, a.height, 2048):
                w = Window(0, r, a.width, min(2048, a.height - r))
                h = a.read(1, window=w)
                n = g.read(1, window=w)
                dst.write(np.where(h == NODATA, NODATA, h + n).astype("float32"), 1, window=w)
    tmp.rename(out)
    shutil.rmtree(work)
    return out


def build(mode: str) -> Path:
    src = ellipsoidal_raster(mode)
    out = config.build_dir(mode) / "terrain"
    if config.fresh(out / "layer.json", src):
        config.log("terrain: quantized-mesh up to date, skipped")
        return out
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    config.log("terrain: ctb-tile (quantized-mesh)")
    # linux/amd64 image; -C adds root tiles Cesium needs, -N vertex normals for terrain lighting
    _run("docker", "run", "--rm", "--platform", "linux/amd64", "-v", f"{src.parent}:/in:ro", "-v",
         f"{out}:/out", CTB_IMAGE, "ctb-tile", "-f", "Mesh", "-C", "-N", "-o", "/out",
         f"/in/{src.name}")  # fmt: skip
    _run("docker", "run", "--rm", "--platform", "linux/amd64", "-v", f"{src.parent}:/in:ro", "-v",
         f"{out}:/out", CTB_IMAGE, "ctb-tile", "-f", "Mesh", "-C", "-N", "-l", "-o", "/out",
         f"/in/{src.name}")  # fmt: skip
    layer = json.loads((out / "layer.json").read_text())
    with rasterio.open(src) as s:  # ctb reports a misleading "bounds"; use the real raster extent
        layer["bounds"] = [round(v, 6) for v in s.bounds]
    (out / "layer.json").write_text(json.dumps(layer, indent=2))
    config.log(f"terrain: done, {sum(1 for _ in out.rglob('*.terrain'))} tiles")
    return out


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "sample")
