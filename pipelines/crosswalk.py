# SPDX-License-Identifier: AGPL-3.0-or-later
"""B1: crosswalk building_id <-> UPRN <-> TOID.

OpenMap Local footprints carry no TOID, so: OS Open UPRN points are joined to footprints spatially (inside, else the
nearest footprint within `uprn_match_max_m`), and OS Open Linked Identifiers (BLPU-UPRN-TopographicArea-TOID) gives
each UPRN its TOID. A building's TOID is the most common TOID among its UPRNs.
Output: build/analytics/crosswalk.parquet (one row per matched UPRN, internal) and crosswalk_buildings.parquet
(one row per building_id: n_units, toid, n_toid).
"""

import geopandas as gpd
import pandas as pd

from . import config, os_data

CHUNK = 2_000_000


def _read(csv, usecols, keep, **kw) -> pd.DataFrame:
    """Chunked read of a GB-wide CSV, keeping only rows where keep(chunk) is True."""
    parts = [
        c[keep(c)]
        for c in pd.read_csv(csv, usecols=usecols, chunksize=CHUNK, encoding="utf-8-sig", **kw)
    ]
    return pd.concat(parts, ignore_index=True)


def uprn_points(cfg: dict, bounds) -> gpd.GeoDataFrame:
    csv = next(os_data.get(cfg, "OpenUPRN", area="GB", format="CSV").glob("*.csv"))
    x0, y0, x1, y1 = bounds
    df = _read(
        csv,
        ["UPRN", "X_COORDINATE", "Y_COORDINATE"],
        lambda c: c.X_COORDINATE.between(x0, x1) & c.Y_COORDINATE.between(y0, y1),
    )
    return gpd.GeoDataFrame(
        df[["UPRN"]], geometry=gpd.points_from_xy(df.X_COORDINATE, df.Y_COORDINATE), crs=27700
    )


def uprn_toid(cfg: dict, uprns: set[str]) -> pd.Series:
    name = "lids-2026-09_csv_BLPU-UPRN-TopographicArea-TOID-5.zip"
    d = os_data.get(cfg, "LIDS", area="GB", format="CSV", fileName=name)
    csv = next(d.glob("BLPU_UPRN_TopographicArea_TOID_5.csv"))
    df = _read(
        csv, ["IDENTIFIER_1", "IDENTIFIER_2"], lambda c: c.IDENTIFIER_1.isin(uprns), dtype=str
    )
    df["UPRN"] = df.IDENTIFIER_1.astype("int64")
    return df.drop_duplicates("UPRN").set_index("UPRN").IDENTIFIER_2.rename("toid")


def match(points: gpd.GeoDataFrame, bld: gpd.GeoDataFrame, max_m: float) -> pd.DataFrame:
    """UPRN -> building_id: inside, else nearest within max_m; overlaps resolved by distance then smaller area."""
    j = points.sjoin_nearest(
        bld[["building_id", "area_m2", "geometry"]], max_distance=max_m, distance_col="dist_m"
    )
    j = j.sort_values(["UPRN", "dist_m", "area_m2"]).drop_duplicates("UPRN")
    return pd.DataFrame(j[["UPRN", "building_id", "dist_m"]])


def per_building(xw: pd.DataFrame) -> pd.DataFrame:
    g = xw.groupby("building_id")
    toid = (
        xw.dropna(subset=["toid"])
        .groupby("building_id")
        .toid.agg(lambda s: s.value_counts().index[0])
    )
    return pd.DataFrame(
        {"n_units": g.UPRN.size(), "toid": toid, "n_toid": g.toid.nunique()}
    ).reset_index()


def run(cfg: dict | None = None) -> dict:
    cfg = cfg or config.load()
    out = config.analytics_out(cfg)
    bld = gpd.read_file(config.analytics_heights(cfg), columns=["building_id", "area_m2"])
    pts = uprn_points(cfg, bld.total_bounds)
    xw = match(pts, bld, cfg["analytics"]["uprn_match_max_m"])
    xw = xw.join(uprn_toid(cfg, set(xw.UPRN.astype(str))), on="UPRN")
    xw.to_parquet(out / "crosswalk.parquet", index=False)
    pb = per_building(xw)
    pb.to_parquet(out / "crosswalk_buildings.parquet", index=False)
    stats = {
        "uprn_in_bbox": len(pts),
        "uprn_matched": len(xw),
        "uprn_match_pct": round(100 * len(xw) / len(pts), 2),
        "uprn_inside_pct": round(100 * float((xw.dist_m == 0).mean()), 2),
        "uprn_with_toid_pct": round(100 * float(xw.toid.notna().mean()), 2),
        "buildings": len(bld),
        "buildings_with_uprn": len(pb),
        "buildings_with_uprn_pct": round(100 * len(pb) / len(bld), 2),
        "buildings_with_toid_pct": round(100 * float(pb.toid.notna().sum()) / len(bld), 2),
        "buildings_multi_toid": int((pb.n_toid > 1).sum()),
    }
    config.log(str(stats))
    return stats


if __name__ == "__main__":
    run()
