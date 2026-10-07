# SPDX-License-Identifier: AGPL-3.0-or-later
"""Small roofer parameter grid: run each setting, score it (roof RMSE vs DSM, val3dity), keep the table resumable.

Usage: python -m pipelines.lod2_grid name key=value ...   (e.g. cell1 cellsize=1.0 complexity_factor=0.7)
Results: build/pilot/grid.json {name: {params, reconstructed, ...scores}}; val3dity binary at build/tools/val3dity.
"""

import json
import subprocess
import sys

from . import config, lod2, lod2_qa

SCALE = (
    0.0001,
) * 3  # CityJSON vertex precision; the 1 mm default makes val3dity see duplicate points (code 102)
DSM = config.ROOT / "build" / "aoi" / "raster" / "dsm.vrt"


def score(name: str) -> dict:
    d = lod2.pdir() / name
    path = next(d.glob("*.city.jsonl"))
    rep = d / "val3dity.json"
    subprocess.run(
        [config.ROOT / "build/tools/val3dity", "-r", rep, path], check=True, capture_output=True
    )
    feats = lod2_qa.read_cjseq(path)
    n_ok = sum(
        1 for f in feats for c in f["CityObjects"].values()
        if c["type"] == "Building" and c["attributes"]["rf_extrusion_mode"] == "standard"
    )  # fmt: skip
    s = lod2_qa.summarise(lod2_qa.roof_rmse(feats, DSM))
    return {"reconstructed": n_ok, "total": len(feats), **lod2_qa.val3dity_summary(rep), **s}


def run(name: str, jobs: int = 4, beta: bool = False, **params) -> dict:
    grid = lod2.pdir() / "grid.json"
    lod2.roofer(config.load(), name, jobs=jobs, beta=beta, cj_scale=SCALE, **params)
    res = score(name) | {
        "params": {k: str(v) for k, v in params.items()}
        | ({"roofer": "v1.1.0-beta.1"} if beta else {})
    }
    table = json.loads(grid.read_text()) if grid.exists() else {}
    table[name] = res  # last writer wins; runs are minutes apart, so no lock
    grid.write_text(json.dumps(table, indent=1))
    config.log(f"{name}: {json.dumps(res)}")
    return res


if __name__ == "__main__":
    name, *kv = sys.argv[1:]
    kw = dict(a.split("=") for a in kv)
    run(name, beta=kw.pop("beta", "") == "1", **kw)
