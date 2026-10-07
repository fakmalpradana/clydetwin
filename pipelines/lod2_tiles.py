# SPDX-License-Identifier: AGPL-3.0-or-later
"""Phase 4 LoD2 tiles: roofer CityJSONSeq -> ellipsoidal MultiPolygonZ -> PostGIS -> pg2b3dm -> 3D Tiles 1.1.

Heights use the same OSTN15 + OSGM15 code as LoD1 (`datum.odn_to_ellipsoidal`), so a LoD2 roof sits where the LoD1
extrusion of the same footprint did. Metadata fields are LoD1's (from build/aoi/heights.gpkg) plus `lod = 2`.
Inputs are read from $CLYDETWIN_PILOT (default build/pilot). The tile database must not be the live stack: set COMPOSE_PROJECT_NAME=ctwin-tiles and POSTGRES_PORT=<free port>.
Output: build/pilot/tiles/lod2_v3/ (tileset.json, subtrees, glb) and pilot_ids.json (building_ids that have LoD2).
"""

import json
import os
import shutil
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely
from shapely.geometry import MultiPolygon, Polygon

from . import config, lod2_qa, tiles, tiles_attrs
from .datum import odn_to_ellipsoidal

PG2B3DM = "geodan/pg2b3dm@sha256:318d19d0612603d272eb9b719c747aa6786e02b1a400190aa12715f0486a559f"  # 2.27.0, as LoD1
ATTRS = tiles_attrs.ATTRS + ",lod"
NAME = "lod2_v3"  # build/pilot/tiles/lod2_v3, published to R2 lod2/v3/ (own triangulation, see triangulate_face)
# LoD2 tiles carry ~50x the triangles per building of LoD1: far fewer features per tile
TUNING = ["--max_features_per_tile", "100", "-g", "1500"]


MIN_TRI_AREA = 1e-4  # m2; slivers below this are dropped


def newell_normal(ring: np.ndarray) -> np.ndarray:
    """Unnormalised Newell normal (length = 2 x area) of a closed or open 3D ring; points to the CCW side."""
    r = np.asarray(ring, dtype=float)
    return np.cross(r, np.roll(r, -1, axis=0)).sum(axis=0)


def face_area(outer: np.ndarray, holes=()) -> float:
    """True 3D area of a face: outer ring minus holes."""
    return float(
        np.linalg.norm(newell_normal(outer)) / 2
        - sum(np.linalg.norm(newell_normal(h)) / 2 for h in holes)
    )


def triangulate_face(outer: np.ndarray, holes=()) -> list[np.ndarray]:
    """Triangulate one planar 3D face in metres: list of (3, 3) vertex arrays, wound like the face (outward normal).

    The face is projected onto an orthonormal basis (u, v) of its Newell-normal plane, triangulated with a constrained
    Delaunay (respects concavity and holes; triangles whose centroid is outside the face are dropped), and lifted back
    by the plane equation. Coordinates must be metric (pg2b3dm did this in lon/lat degrees + metres, which is what
    produced the spikes).
    """
    outer = np.asarray(outer, dtype=float)
    n = newell_normal(outer)
    ln = np.linalg.norm(n)
    if ln < 1e-9:
        return []
    n /= ln
    o = outer.mean(axis=0)
    u = np.cross(n, [0.0, 0.0, 1.0] if abs(n[2]) < 0.9 else [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    v = np.cross(n, u)  # (u, v, n) is right-handed, so a CCW ring about n is CCW in (u, v)

    def uv(r):
        d = np.asarray(r, dtype=float) - o
        return np.column_stack([d @ u, d @ v])

    poly = Polygon(uv(outer), [uv(h) for h in holes])
    if not poly.is_valid:
        poly = shapely.make_valid(poly)
    tris = []
    for g in shapely.get_parts(poly) if poly.geom_type != "Polygon" else [poly]:
        if g.geom_type != "Polygon" or g.is_empty:
            continue
        for t in shapely.get_parts(shapely.constrained_delaunay_triangles(g)):
            if not g.contains(t.centroid):
                continue
            xy = np.array(t.exterior.coords)[:3]
            if (xy[1, 0] - xy[0, 0]) * (xy[2, 1] - xy[0, 1]) - (xy[1, 1] - xy[0, 1]) * (
                xy[2, 0] - xy[0, 0]
            ) < 0:
                xy = xy[[0, 2, 1]]
            p3 = o + np.outer(xy[:, 0], u) + np.outer(xy[:, 1], v)
            if np.linalg.norm(newell_normal(p3)) / 2 >= MIN_TRI_AREA:
                tris.append(p3)
    return tris


def building_faces(feat: dict):
    """Yield (outer ring Nx3, [hole rings]) in BNG metres + ODN z for every non-ground LoD2.2 face."""
    xyz = feat["xyz"]
    for co in feat["CityObjects"].values():
        for g in co.get("geometry", []):
            if g["lod"] != "2.2":
                continue
            surf = g["semantics"]["surfaces"]
            for shell, vals in zip(g["boundaries"], g["semantics"]["values"], strict=True):
                for face, v in zip(shell, vals, strict=True):
                    if surf[v]["type"] != "GroundSurface":
                        yield xyz[face[0]], [xyz[r] for r in face[1:]]


def building_geometry(feat: dict) -> MultiPolygon | None:
    """All wall and roof faces of a building's LoD2.2 parts as a 3D MultiPolygon of triangles (lon, lat, ellipsoidal z).

    Faces are triangulated here in metres (`triangulate_face`), then each vertex goes through the datum transform.
    The floor (GroundSurface) is left out as in LoD1: never seen from below. None when roofer made no solid.
    """
    tris = [t for outer, holes in building_faces(feat) for t in triangulate_face(outer, holes)]
    if not tris:
        return None
    pts = np.concatenate(tris)
    lon, lat, h = odn_to_ellipsoidal(*pts.T)
    ll = np.column_stack([lon, lat, h]).reshape(-1, 3, 3)
    return MultiPolygon([Polygon(t) for t in ll])


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
