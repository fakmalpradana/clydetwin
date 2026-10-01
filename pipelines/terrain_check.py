# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read heights back out of the generated quantized-mesh tiles (independent of the GeoTIFF they came from)."""

import gzip
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

from . import config


def _zigzag(a: np.ndarray) -> np.ndarray:
    a = a.astype(np.int32)
    return (a >> 1) ^ -(a & 1)


def decode(path: Path):
    """Quantized-mesh 1.0 tile -> (u, v, height_m, triangles). u, v in 0..1 within the tile."""
    b = gzip.open(path).read()
    min_h, max_h = struct.unpack_from("<ff", b, 24)
    n = struct.unpack_from("<I", b, 88)[0]
    off = 92
    uvh = []
    for _ in range(3):
        uvh.append(np.cumsum(_zigzag(np.frombuffer(b, "<u2", n, off))))
        off += 2 * n
    u, v, h = (a / 32767.0 for a in uvh)
    height = min_h + h * (max_h - min_h)
    wide = n > 65536
    off += (-off) % (4 if wide else 2)
    tri_n = struct.unpack_from("<I", b, off)[0]
    off += 4
    idx = np.frombuffer(b, "<u4" if wide else "<u2", tri_n * 3, off).astype(np.int64)
    out, hi = np.empty_like(idx), 0  # high-water-mark decoding
    for i, c in enumerate(idx):
        out[i] = hi - c
        hi = max(hi, out[i] + 1)
    return u, v, height, out.reshape(-1, 3)


def height_at(terrain_dir: Path, lon: float, lat: float) -> float:
    """Interpolate the terrain height at lon/lat from the highest-zoom tile (TMS geodetic scheme)."""
    zmax = max(int(p.name) for p in terrain_dir.iterdir() if p.name.isdigit())
    size = 180.0 / 2**zmax
    x, y = int((lon + 180) // size), int((lat + 90) // size)
    u, v, h, tri = decode(terrain_dir / str(zmax) / str(x) / f"{y}.terrain")
    pu, pv = (lon + 180) / size - x, (lat + 90) / size - y
    for a, b, c in tri:
        d = (v[b] - v[c]) * (u[a] - u[c]) + (u[c] - u[b]) * (v[a] - v[c])
        if d == 0:
            continue
        l1 = ((v[b] - v[c]) * (pu - u[c]) + (u[c] - u[b]) * (pv - v[c])) / d
        l2 = ((v[c] - v[a]) * (pu - u[c]) + (u[a] - u[c]) * (pv - v[c])) / d
        if min(l1, l2, 1 - l1 - l2) >= -1e-9:
            return float(l1 * h[a] + l2 * h[b] + (1 - l1 - l2) * h[c])
    return math.nan


def check(mode: str, n: int = 5) -> list[dict]:
    """Compare terrain height with each building's ground_z_ellip at n spread-out, large footprints."""
    import geopandas as gpd

    g = gpd.read_file(config.build_dir(mode) / "heights.gpkg")
    g = g[g.area_m2 > 300].sort_values("building_id")
    sel = g.iloc[np.linspace(0, len(g) - 1, n).astype(int)]
    c = sel.geometry.centroid.to_crs(4326)
    rows = []
    for (_, r), p in zip(sel.iterrows(), c, strict=True):
        t = height_at(config.build_dir(mode) / "terrain", p.x, p.y)
        rows.append(
            {"building_id": r.building_id, "lon": round(p.x, 5), "lat": round(p.y, 5),
             "ground_z_ellip": round(r.ground_z_ellip, 2), "terrain": round(t, 2),
             "diff_m": round(t - r.ground_z_ellip, 2)}
        )  # fmt: skip
    return rows


if __name__ == "__main__":
    print(json.dumps(check(sys.argv[1] if len(sys.argv) > 1 else "sample"), indent=1))
