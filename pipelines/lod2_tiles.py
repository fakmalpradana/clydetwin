# SPDX-License-Identifier: AGPL-3.0-or-later
"""Phase 4 LoD2 tiles: roofer CityJSONSeq -> ellipsoidal MultiPolygonZ -> PostGIS -> pg2b3dm -> 3D Tiles 1.1.

Heights use the same OSTN15 + OSGM15 code as LoD1 (`datum.odn_to_ellipsoidal`), so a LoD2 roof sits where the LoD1
extrusion of the same footprint did. Metadata fields are LoD1's (from build/aoi/heights.gpkg) plus `lod = 2`.
Inputs are read from $CLYDETWIN_PILOT (default build/pilot). The tile database must not be the live stack: set COMPOSE_PROJECT_NAME=ctwin-tiles and POSTGRES_PORT=<free port>.
Output: build/pilot/tiles/lod2_v2/ (tileset.json, subtrees, glb) and pilot_ids.json (building_ids that have LoD2).
"""

import json
import os
import shutil
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
from shapely.geometry import MultiPolygon, Polygon

from . import config, lod2_qa, tiles, tiles_attrs
from .datum import odn_to_ellipsoidal

PG2B3DM = "geodan/pg2b3dm@sha256:318d19d0612603d272eb9b719c747aa6786e02b1a400190aa12715f0486a559f"  # 2.27.0, as LoD1
ATTRS = tiles_attrs.ATTRS + ",lod"
NAME = "lod2_v2"  # build/pilot/tiles/lod2_v2, published to R2 lod2/v2/ (analytics attributes, same fields as lod1/v4)
# LoD2 tiles carry ~50x the triangles per building of LoD1: far fewer features per tile
TUNING = ["--max_features_per_tile", "100", "-g", "1500"]


def building_geometry(feat: dict) -> MultiPolygon | None:
    """All wall and roof faces of a building's LoD2.2 parts as one 3D MultiPolygon (lon, lat, ETRS89 ellipsoidal z).

    The floor (GroundSurface) is left out as in LoD1: never seen from below. None when roofer made no solid.
    """
    lon, lat, h = odn_to_ellipsoidal(*feat["xyz"].T)
    ll = np.column_stack([lon, lat, h])
    polys = []
    for co in feat["CityObjects"].values():
        for g in co.get("geometry", []):
            if g["lod"] != "2.2":
                continue
            surf = g["semantics"]["surfaces"]
            for shell, vals in zip(g["boundaries"], g["semantics"]["values"], strict=True):
                for face, v in zip(shell, vals, strict=True):
                    if surf[v]["type"] != "GroundSurface":
                        polys.append(Polygon(ll[face[0]], [ll[r] for r in face[1:]]))
    return MultiPolygon(polys) if polys else None


def build_rows(run: str) -> gpd.GeoDataFrame:
    feats = lod2_qa.read_cjseq(
        next(
            (Path(os.environ.get("CLYDETWIN_PILOT", config.ROOT / "build" / "pilot")) / run).glob(
                "*.city.jsonl"
            )
        )
    )
    rows = [(f["id"], building_geometry(f)) for f in feats]
    g = gpd.GeoDataFrame(
        [{"building_id": i, "geometry": m} for i, m in rows if m is not None], crs=4326
    )  # ETRS89 lon/lat labelled 4326 (identical at the metre level), z stays ellipsoidal
    h = gpd.read_file(config.build_dir("aoi") / "heights.gpkg", ignore_geometry=True)
    cols = ["building_id", "height", "h_max", "h_p90", "ground_z_odn", "ground_z_ellip", "area_m2", "height_source", "lidar_year"]  # fmt: skip
    g = g.merge(h[cols], on="building_id", how="inner")
    g["lod"] = 2
    return g


def run(run_name: str) -> int:
    out = config.build_dir("pilot")
    g = build_rows(run_name)
    g.to_file(out / "lod2_src.gpkg", driver="GPKG", layer="lod2_src")
    tiles._sh("docker", "compose", "up", "-d", "--wait", "db", cwd=config.ROOT)
    tiles._psql("CREATE EXTENSION IF NOT EXISTS postgis")
    tiles._psql("DROP TABLE IF EXISTS lod2_src; DROP TABLE IF EXISTS lod2")
    pg = f"PG:host=localhost port={tiles.DB['port']} dbname={tiles.DB['name']} user={tiles.DB['user']} password={tiles.DB['password']}"
    tiles._sh("ogr2ogr", "-f", "PostgreSQL", pg, out / "lod2_src.gpkg", "-nln", "lod2_src", "-lco", "GEOMETRY_NAME=geom")  # fmt: skip
    # real/int4 (not float8/int8): pg2b3dm 2.27 mis-aligns 8-byte metadata buffers (same as db/lod1.sql)
    tiles._psql(
        "CREATE TABLE lod2 AS SELECT building_id, height::real, h_max::real, h_p90::real, ground_z_odn::real,"
        " ground_z_ellip::real, area_m2::real, height_source, lidar_year::int, lod::int, geom FROM lod2_src;"
        " CREATE INDEX ON lod2 USING gist (geom)"
    )
    tiles_attrs.load_attrs_src(config.load())
    n = tiles_attrs.join_attrs("lod2", "lod2_attrs")
    shutil.rmtree(out / "tiles" / NAME, ignore_errors=True)
    tiles.pg2b3dm("pilot", "lod2_attrs", ATTRS, TUNING, PG2B3DM, name=NAME)
    tiles.validate("pilot", NAME)
    # contract for the web: LoD1 buildings with these ids are hidden inside the pilot (published beside tileset.json)
    (out / "tiles" / NAME / "pilot_ids.json").write_text(json.dumps(sorted(g.building_id)))
    return n


if __name__ == "__main__":
    print(run(sys.argv[1]), "buildings in the LoD2 tileset")
