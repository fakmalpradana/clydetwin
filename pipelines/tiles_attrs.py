# SPDX-License-Identifier: AGPL-3.0-or-later
"""B8: rebuild the LoD1 tiles with the per-building analytics attributes -> build/<mode>/tiles/lod1_v4/.

Reuses pipelines.tiles (PostGIS load + extrusion, pg2b3dm, validator); the attributes come from
build/analytics/buildings_attrs.parquet through `attrs_src` and db/lod1_attrs.sql. Publish the result to R2 `lod1/v4/`
(never over an existing version): `python -m pipelines.publish build/aoi/tiles/lod1_v4 lod1/v4`.
"""

import pandas as pd

from . import attrs, config, tiles

NAME = "lod1_v4"
TEXT = ["flood_river", "flood_coastal", "flood_surface", "flood_max", "noise_band", "epc_rating",
        "lb_category", "data_zone"]  # fmt: skip
NUM = [
    "volume_m3",
    "storeys_est",
    "noise_lden_db",
    "epc_count",
    "epc_sap_median",
    "conservation_area",
    "flood_share_max",
]
ATTRS = ",".join([tiles.ATTRS, *NUM, *TEXT])
# Tile metadata has no nulls: text without a value is 'none', numbers without a value are -1. real/int4 only (pg2b3dm 2.27
# mis-aligns 8-byte metadata buffers). The CSV load turns missing text into '', hence NULLIF.
SELECT_SQL = """
       a.volume_m3::real AS volume_m3,
       a.storeys_est::int AS storeys_est,
       COALESCE(NULLIF(a.flood_river, ''), 'none') AS flood_river,
       COALESCE(NULLIF(a.flood_coastal, ''), 'none') AS flood_coastal,
       COALESCE(NULLIF(a.flood_surface, ''), 'none') AS flood_surface,
       COALESCE(NULLIF(a.flood_max, ''), 'none') AS flood_max,
       COALESCE(a.flood_share_max, 0)::real AS flood_share_max,
       COALESCE(a.noise_lden_db, -1)::real AS noise_lden_db,
       COALESCE(NULLIF(a.noise_band, ''), 'none') AS noise_band,
       COALESCE(a.epc_count, 0)::int AS epc_count,
       COALESCE(a.epc_sap_median, -1)::real AS epc_sap_median,
       COALESCE(NULLIF(a.epc_rating, ''), 'none') AS epc_rating,
       COALESCE(NULLIF(a.lb_category, ''), 'none') AS lb_category,
       COALESCE(a.conservation_area, 0)::int AS conservation_area,
       COALESCE(NULLIF(a.data_zone, ''), 'none') AS data_zone"""


def load_attrs_src(cfg: dict) -> None:
    """build/analytics/buildings_attrs.parquet -> PostGIS table attrs_src (public columns only)."""
    df = pd.read_parquet(config.analytics_out(cfg) / "buildings_attrs.parquet")
    attrs.check_public_columns(TEXT + NUM)
    csv = config.analytics_out(cfg) / "attrs_src.csv"
    out = df[["building_id", *NUM, *TEXT]].copy()
    out["conservation_area"] = out.conservation_area.astype("float").round()
    out.to_csv(csv, index=False)
    pg = (
        f"PG:host=localhost port={tiles.DB['port']} dbname={tiles.DB['name']} "
        f"user={tiles.DB['user']} password={tiles.DB['password']}"
    )
    tiles._psql("DROP TABLE IF EXISTS attrs_src")
    tiles._sh("ogr2ogr", "-f", "PostgreSQL", pg, csv, "-nln", "attrs_src",
              "-oo", "AUTODETECT_TYPE=YES", "-oo", "AUTODETECT_SIZE_LIMIT=0")  # fmt: skip


def join_attrs(src: str, dst: str) -> int:
    """dst = src (with its geometry) + the analytics columns, joined on building_id; row count must not change."""
    tiles._psql(f"DROP TABLE IF EXISTS {dst}")
    tiles._psql(
        f"CREATE TABLE {dst} AS SELECT l.*, {SELECT_SQL} FROM {src} l LEFT JOIN attrs_src a USING (building_id);"
        f" CREATE INDEX ON {dst} USING gist (geom)"
    )
    n, m = (int(tiles._psql(f"SELECT count(*) FROM {t}")) for t in (src, dst))
    assert m == n, "the attribute join changed the row count"
    return m


def run(mode: str = "aoi") -> int:
    cfg = config.load()
    n = tiles.load_db(mode)
    load_attrs_src(cfg)
    m = join_attrs("lod1", "lod1_attrs")
    config.log(f"lod1_attrs: {m} rows (lod1 {n})")
    tiles.pg2b3dm(mode, "lod1_attrs", ATTRS, name=NAME)
    tiles.validate(mode, NAME)
    return m


if __name__ == "__main__":
    import sys

    run(sys.argv[1] if len(sys.argv) > 1 else "aoi")
