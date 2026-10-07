# SPDX-License-Identifier: AGPL-3.0-or-later
"""B4 / X6: road, rail, air and industry noise (Lden) per building, Scottish Noise Mapping Round 4 (2021, OGL v3).

The consolidated Lden grid (10 m cells, receiver height 4 m, EPSG:27700, 0 = outside the model, stored as null) is sampled as
the maximum over each footprint buffered by `noise.buffer_m`, an approximation of the loudest facade. The grid is
strategic noise mapping for the agglomeration: it is not an assessment of a single property.
Output: part_noise.parquet (noise_lden_db float, noise_band: <50|50-54|55-59|60-64|65-69|70-74|75+).
"""

import subprocess

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from exactextract import exact_extract

from . import config
from .download import fetch

ZIP = "https://map.sepa.org.uk/atom/noise/Noise_Consolidated_LDEN.zip"
TIF = "HORE_CONSOLIDATED_LDEN.tif"
BANDS = ["<50", "50-54", "55-59", "60-64", "65-69", "70-74", "75+"]


def band(db: pd.Series) -> pd.Series:
    """5 dB END-style bands from 50 dB; NaN (no grid cell) stays null."""
    idx = np.clip(np.floor((db - 50) / 5) + 1, 0, 6)
    out = pd.Series(np.array(BANDS, dtype=object)[idx.fillna(0).astype(int)], index=db.index)
    return out.where(db.notna())


def grid(raw) -> str:
    z = fetch(ZIP, raw / "Noise_Consolidated_LDEN.zip")
    if not (raw / TIF).exists():
        subprocess.run(["unzip", "-o", "-q", str(z), "-d", str(raw)], check=True)
    return str(raw / TIF)


def run(cfg: dict | None = None) -> pd.DataFrame:
    cfg = cfg or config.load()
    raw = config.resolve(cfg["analytics"]["raw_dir"]) / "noise"
    bld = gpd.read_file(config.analytics_heights(cfg), columns=["building_id"])
    bld["geometry"] = bld.buffer(cfg["analytics"]["noise_buffer_m"])
    with rasterio.open(grid(raw)) as src:
        r = exact_extract(src, bld, ["max"], include_cols="building_id", output="pandas")
    out = pd.DataFrame({"building_id": r.building_id, "noise_lden_db": r["max"].astype("float32")})
    out["noise_lden_db"] = out.noise_lden_db.round(1).where(
        out.noise_lden_db > 0
    )  # 0 = outside the model
    out["noise_band"] = band(out.noise_lden_db)
    out.to_parquet(config.analytics_out(cfg) / "part_noise.parquet", index=False)
    config.log(
        f"noise: null {out.noise_lden_db.isna().sum()}, bands {out.noise_band.value_counts().to_dict()}"
    )
    return out


if __name__ == "__main__":
    run()
