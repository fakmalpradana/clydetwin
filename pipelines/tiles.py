# SPDX-License-Identifier: AGPL-3.0-or-later
"""Task 1.8: load heights into PostGIS, build LoD1 extrusions, run pg2b3dm -> 3D Tiles 1.1.

Needs: docker (PostGIS + geodan/pg2b3dm images), GDAL ogr2ogr, and `npx` for the validator.
Output: build/<mode>/tiles/lod1/ (tileset.json + implicit-tiling subtrees + glb content).
"""

import os
import re
import shutil
import subprocess

from . import config

MIN_COMPLETENESS = 0.98  # Gate P1: >= 98% of footprints must be in the tileset
# Full-city tuning (81k footprints, tested with constant heights): the 1000-feature default gave 193 tiles up to
# 1.9 MB; 500 gives 389 tiles up to 0.76 MB (mean 0.23 MB), so first paint needs only small requests. Root geometric
# error 1500 m (about the AOI half-extent) keeps content-less top levels traversing down to the leaf tiles.
PG2B3DM_TUNING = ["--max_features_per_tile", "500", "-g", "1500"]
ATTRS = (
    "building_id,height,h_max,h_p90,ground_z_odn,ground_z_ellip,area_m2,height_source,lidar_year"
)
DB = {
    "user": os.environ.get("POSTGRES_USER", "clydetwin"),
    "password": os.environ.get("POSTGRES_PASSWORD", "clydetwin_local"),
    "name": os.environ.get("POSTGRES_DB", "clydetwin"),
    "port": os.environ.get("POSTGRES_PORT", "5433"),
}


def _sh(*cmd, **kw) -> subprocess.CompletedProcess:
    return subprocess.run([str(c) for c in cmd], check=True, text=True, **kw)


def _psql(sql: str | None = None, file=None) -> str:
    cmd = [
        "docker",
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        DB["user"],
        "-d",
        DB["name"],
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
    ]
    r = subprocess.run(
        cmd + (["-c", sql] if sql else []),
        input=None if sql else file.read_text(),
        text=True,
        capture_output=True,
        cwd=config.ROOT,
    )
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


def load_db(mode: str) -> int:
    _sh("docker", "compose", "up", "-d", "--wait", "db", cwd=config.ROOT)
    _psql("CREATE EXTENSION IF NOT EXISTS postgis")
    _psql("DROP TABLE IF EXISTS buildings_src")
    src = config.build_dir(mode) / "heights.gpkg"
    pg = f"PG:host=localhost port={DB['port']} dbname={DB['name']} user={DB['user']} password={DB['password']}"
    _sh(
        "ogr2ogr",
        "-f",
        "PostgreSQL",
        pg,
        src,
        "-t_srs",
        "EPSG:4326",  # host GDAL/PROJ has the OSTN15 grid; the PostGIS image would fall back to a ~1 m-off Helmert
        "-nln",
        "buildings_src",
        "-lco",
        "GEOMETRY_NAME=geom",
    )
    _psql(file=config.ROOT / "db" / "lod1.sql")
    n_src = int(_psql("SELECT count(*) FROM buildings_src"))
    n_out = int(_psql("SELECT count(*) FROM lod1"))
    print(f"lod1 rows: {n_out} / {n_src} footprints ({n_out / n_src:.2%})")
    if n_out < MIN_COMPLETENESS * n_src:
        raise RuntimeError(
            f"only {n_out}/{n_src} buildings reached the tileset (< {MIN_COMPLETENESS:.0%})"
        )
    return n_out


def pg2b3dm(mode: str) -> None:
    out = config.build_dir(mode) / "tiles" / "lod1"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    conn = (
        f"Host=host.docker.internal;Port={DB['port']};Database={DB['name']};"
        f"Username={DB['user']};Password={DB['password']};CommandTimeOut=0"
    )
    _sh(
        "docker",
        "run",
        "--rm",
        "--platform",
        "linux/amd64",
        "-v",
        f"{out}:/out",
        "geodan/pg2b3dm",
        "--connection",
        conn,
        "-t",
        "lod1",
        "-c",
        "geom",
        "-a",
        ATTRS,
        "-o",
        "/out",
        *PG2B3DM_TUNING,
        "--default_color",
        "#C8C8C8",
        "--copyright",
        "ClydeTwin; OS OpenMap Local OGL; Scottish LiDAR OGL",
    )


def validate(mode: str) -> None:
    """3d-tiles-validator in a Node 22 container (its native deps do not build on newer local Node)."""
    out = config.build_dir(mode) / "tiles" / "lod1"
    r = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{out}:/t",
            "node:22-slim",
            "npx",
            "--yes",
            "3d-tiles-validator",
            "validate",
            "--tilesetFile",
            "/t/tileset.json",
        ],
        text=True,
        capture_output=True,
    )
    m = re.search(r'"numErrors":\s*(\d+)', r.stdout)
    if not m or int(m.group(1)):
        raise RuntimeError(f"3d-tiles-validator failed:\n{r.stdout[-3000:]}{r.stderr[-1000:]}")
    print("3d-tiles-validator: 0 errors")


def run(mode: str) -> int:
    n = load_db(mode)
    pg2b3dm(mode)
    validate(mode)
    return n


if __name__ == "__main__":
    import sys

    run(sys.argv[1] if len(sys.argv) > 1 else "sample")
