# SPDX-License-Identifier: AGPL-3.0-or-later
"""B2 + B8: X1 volume/storeys and assembly of build/analytics/buildings_attrs.parquet (one row per building_id).

Every other analytics module writes `part_<name>.parquet` (building_id + its columns); `assemble` left-joins
whatever parts exist onto the LoD1 base table, so a module can be re-run alone.
"""

import geopandas as gpd
import numpy as np
import pandas as pd

from . import config

BASE = ["building_id", "height", "height_source", "area_m2"]


def storeys(height: pd.Series, storey_m: float) -> pd.Series:
    """Heuristic floor count: height / storey_m rounded, at least 1."""
    return np.maximum(1, np.round(height / storey_m)).astype("int16")


def assemble(cfg: dict | None = None) -> pd.DataFrame:
    cfg = cfg or config.load()
    out = config.analytics_out(cfg)
    df = gpd.read_file(config.analytics_heights(cfg), columns=BASE, ignore_geometry=True)
    df["volume_m3"] = (df.area_m2 * df.height).round(1)
    df["storeys_est"] = storeys(df.height, cfg["analytics"]["storey_height_m"])
    for part in sorted(out.glob("part_*.parquet")) + [out / "crosswalk_buildings.parquet"]:
        if part.exists():
            df = df.merge(pd.read_parquet(part), on="building_id", how="left")
    for c in ("n_uprn", "n_toid"):  # counts: no UPRN means 0, not null
        if c in df:
            df[c] = df[c].fillna(0).astype("int32")
    df.to_parquet(out / "buildings_attrs.parquet", index=False)
    config.log(f"buildings_attrs.parquet: {len(df)} rows, columns {list(df.columns)}")
    return df


if __name__ == "__main__":
    assemble()
