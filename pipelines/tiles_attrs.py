# SPDX-License-Identifier: AGPL-3.0-or-later
"""B8: rebuild the LoD1 tiles with the per-building analytics attributes -> build/<mode>/tiles/lod1_v3/.

Reuses pipelines.tiles (PostGIS load + extrusion, pg2b3dm, validator); the attributes come from
build/analytics/buildings_attrs.parquet through `attrs_src` and db/lod1_attrs.sql. Publish the result to R2 `lod1/v3/`
(never over an existing version): `python -m pipelines.publish build/aoi/tiles/lod1_v3 lod1/v3`.
"""

import pandas as pd

from . import attrs, config, tiles

NAME = "lod1_v3"
TEXT = ["flood_river", "flood_coastal", "flood_surface", "flood_max", "noise_band", "epc_rating",
        "lb_category", "data_zone"]  # fmt: skip
NUM = [
    "volume_m3",
    "storeys_est",
    "noise_lden_db",
    "epc_count",
    "epc_sap_median",
    "conservation_area",
]
ATTRS = ",".join([tiles.ATTRS, *NUM, *TEXT])


def run(mode: str = "aoi") -> int:
    cfg = config.load()
    df = pd.read_parquet(config.analytics_out(cfg) / "buildings_attrs.parquet")
    attrs.check_public_columns(TEXT + NUM)
    csv = config.analytics_out(cfg) / "attrs_src.csv"
    out = df[["building_id", *NUM, *TEXT]].copy()
    out["conservation_area"] = out.conservation_area.astype("float").round()
    out.to_csv(csv, index=False)
    n = tiles.load_db(mode)
    pg = (
        f"PG:host=localhost port={tiles.DB['port']} dbname={tiles.DB['name']} "
        f"user={tiles.DB['user']} password={tiles.DB['password']}"
    )
    tiles._psql("DROP TABLE IF EXISTS attrs_src")
    tiles._sh("ogr2ogr", "-f", "PostgreSQL", pg, csv, "-nln", "attrs_src",
              "-oo", "AUTODETECT_TYPE=YES", "-oo", "AUTODETECT_SIZE_LIMIT=0")  # fmt: skip
    tiles._psql(file=config.ROOT / "db" / "lod1_attrs.sql")
    m = int(tiles._psql("SELECT count(*) FROM lod1_attrs"))
    j = int(tiles._psql("SELECT count(*) FROM lod1_attrs WHERE data_zone <> 'none'"))
    config.log(f"lod1_attrs: {m} rows (lod1 {n}), {j} with a data zone")
    assert m == n, "the attribute join changed the row count"
    tiles.pg2b3dm(mode, "lod1_attrs", ATTRS, name=NAME)
    tiles.validate(mode, NAME)
    return m


if __name__ == "__main__":
    import sys

    run(sys.argv[1] if len(sys.argv) > 1 else "aoi")
