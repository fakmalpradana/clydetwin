# SPDX-License-Identifier: AGPL-3.0-or-later
"""Task 1.4: DSM/DTM mosaics (VRT), nDSM = DSM - DTM, and COGs (nDSM, DTM, hillshade).

Needs the GDAL command line tools (gdalbuildvrt, gdal_translate, gdaldem) on PATH.
"""

import subprocess
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

from . import config

NODATA = -9999.0


def _run(*cmd) -> None:
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.stdout.strip() or r.stderr.strip():
        print(r.stdout + r.stderr, flush=True)
    r.check_returncode()


def _cog(src: Path, dst: Path, predictor: int = 3) -> None:
    tmp = config.partial(dst)
    _run(
        "gdal_translate", "--config", "GDAL_CACHEMAX", "1024", "-of", "COG",
        "-co", "COMPRESS=DEFLATE", "-co", f"PREDICTOR={predictor}", "-co", "BIGTIFF=YES", "-co", "NUM_THREADS=ALL_CPUS", src, tmp,
    )  # fmt: skip
    tmp.rename(dst)


def ndsm(dsm_vrt: Path, dtm_vrt: Path, out: Path, block: int = 2048) -> None:
    """nDSM = max(DSM - DTM, 0), processed in blocks; nodata where either input is nodata."""
    with rasterio.open(dsm_vrt) as dsm, rasterio.open(dtm_vrt) as dtm:
        if (dsm.transform, dsm.shape) != (dtm.transform, dtm.shape):
            raise ValueError("DSM and DTM mosaics are not on the same grid")
        profile = dsm.profile | {
            "driver": "GTiff",
            "tiled": True,
            "blockxsize": 256,
            "blockysize": 256,
            "compress": "deflate",
            "predictor": 3,
            "nodata": NODATA,
            "BIGTIFF": "IF_SAFER",
        }
        with rasterio.open(out, "w", **profile) as dst:
            for row in range(0, dsm.height, block):
                for col in range(0, dsm.width, block):
                    w = Window(col, row, min(block, dsm.width - col), min(block, dsm.height - row))
                    a = dsm.read(1, window=w)
                    b = dtm.read(1, window=w)
                    bad = (a == dsm.nodata) | (b == dtm.nodata) | np.isnan(a) | np.isnan(b)
                    h = np.where(bad, NODATA, np.maximum(a - b, 0)).astype("float32")
                    dst.write(h, 1, window=w)


def run(mode: str, cfg: dict | None = None) -> dict[str, Path]:
    cfg = cfg or config.load()
    out = config.build_dir(mode) / "raster"
    out.mkdir(exist_ok=True)
    vrt = {}
    tiles = {k: config.lidar_tiles(cfg, mode, k) for k in ("dsm", "dtm")}
    for kind in ("dsm", "dtm"):
        vrt[kind] = out / f"{kind}.vrt"
        _run("gdalbuildvrt", "-overwrite", vrt[kind], *tiles[kind])
    srcs = [*tiles["dsm"], *tiles["dtm"]]
    paths = {
        "dtm": out / "dtm.cog.tif",
        "ndsm": out / "ndsm.cog.tif",
        "hillshade": out / "hillshade.cog.tif",
    }
    nd, hs = out / "ndsm.tif", out / "hillshade.tif"  # intermediates, deleted once their COG exists

    def step(name, target, make):
        if config.fresh(target, *srcs):
            config.log(f"{name}: up to date, skipped")
            return
        config.log(f"{name}: start")
        make()
        config.log(f"{name}: done")

    def make_ndsm():
        tmp = config.partial(nd)
        ndsm(vrt["dsm"], vrt["dtm"], tmp)
        tmp.rename(nd)

    def make_hs():
        tmp = config.partial(hs)
        _run("gdaldem", "hillshade", "-of", "GTiff", "-multidirectional", "-compute_edges",
             vrt["dtm"], tmp)  # fmt: skip
        tmp.rename(hs)

    step("dtm COG", paths["dtm"], lambda: _cog(vrt["dtm"], paths["dtm"]))
    if not config.fresh(paths["ndsm"], *srcs):
        step("nDSM", nd, make_ndsm)
        step("nDSM COG", paths["ndsm"], lambda: _cog(nd, paths["ndsm"]))
    if not config.fresh(paths["hillshade"], *srcs):
        step("hillshade", hs, make_hs)
        step("hillshade COG", paths["hillshade"], lambda: _cog(hs, paths["hillshade"], predictor=2))
    for tmp in (nd, hs):
        tmp.unlink(missing_ok=True)
    return paths | {"dtm_vrt": vrt["dtm"]}


if __name__ == "__main__":
    import sys

    print(run(sys.argv[1] if len(sys.argv) > 1 else "sample"))
