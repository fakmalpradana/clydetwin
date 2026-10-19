# SPDX-License-Identifier: AGPL-3.0-or-later
"""LoD2 QA: roofer CityJSONSeq reader, roof-vs-DSM residuals, val3dity summary.

Roof residual = LoD2 roof plane height minus the LiDAR DSM at every 0.5 m DSM pixel centre inside each roof face
(faces shrunk by `ERODE_M` so mixed edge pixels do not count). Both are in ODN heights, EPSG:27700.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
import shapely
from rasterio.windows import from_bounds
from shapely.geometry import Polygon

ERODE_M = 0.5


def read_cjseq(path: Path) -> list[dict]:
    """Features of a CityJSONSeq file with absolute (scaled + translated) vertex coordinates under `xyz`."""
    with open(path) as f:
        head = json.loads(f.readline())
        scale = np.array(head["transform"]["scale"])
        shift = np.array(head["transform"]["translate"])
        feats = []
        for line in f:
            d = json.loads(line)
            d["xyz"] = np.array(d["vertices"], dtype=float).reshape(-1, 3) * scale + shift
            feats.append(d)
    return feats


def roof_faces(feat: dict):
    """Yield (building_id, outer ring Nx3, [hole rings]) for every LoD2.2 RoofSurface face."""
    xyz = feat["xyz"]
    for co in feat["CityObjects"].values():
        for g in co.get("geometry", []):
            if g["lod"] != "2.2":
                continue
            surf = g["semantics"]["surfaces"]
            for shell, vals in zip(g["boundaries"], g["semantics"]["values"], strict=True):
                for face, v in zip(shell, vals, strict=True):
                    if surf[v]["type"] == "RoofSurface":
                        rings = [xyz[r] for r in face]
                        yield feat["id"], rings[0], rings[1:]


def plane_z(ring: np.ndarray):
    """Least-squares plane through a ring; returns f(x, y) -> z, or None for (near) vertical faces."""
    c = ring.mean(axis=0)
    n = np.linalg.svd(ring - c)[2][-1]
    if abs(n[2]) < 0.1:
        return None
    return lambda x, y: c[2] - (n[0] * (x - c[0]) + n[1] * (y - c[1])) / n[2]


def face_residuals(outer, holes, dsm) -> np.ndarray:
    """LoD2 roof z minus DSM z at the DSM pixel centres inside one roof face (eroded by ERODE_M)."""
    f = plane_z(outer)
    poly = Polygon(outer[:, :2], [h[:, :2] for h in holes]).buffer(0).buffer(-ERODE_M)
    if f is None or poly.is_empty:
        return np.empty(0)
    win = from_bounds(*poly.bounds, transform=dsm.transform).round_offsets().round_lengths()
    z = dsm.read(1, window=win, boundless=True, fill_value=dsm.nodata)
    rows, cols = np.mgrid[: z.shape[0], : z.shape[1]]
    xs, ys = rasterio.transform.xy(dsm.window_transform(win), rows.ravel(), cols.ravel())
    xs, ys, z = np.asarray(xs), np.asarray(ys), z.ravel()
    ok = shapely.contains_xy(poly, xs, ys) & (z != dsm.nodata) & np.isfinite(z)
    return f(xs[ok], ys[ok]) - z[ok]


def roof_rmse(feats: list[dict], dsm_path: Path) -> dict[str, np.ndarray]:
    """building_id -> residual array (all roof faces of the building)."""
    out: dict[str, list] = {}
    with rasterio.open(dsm_path) as dsm:
        for feat in feats:
            for bid, outer, holes in roof_faces(feat):
                out.setdefault(bid, []).append(face_residuals(outer, holes, dsm))
    return {k: np.concatenate(v) for k, v in out.items()}


def summarise(res: dict[str, np.ndarray]) -> dict:
    """Pixel-weighted overall RMSE plus the per-building RMSE distribution."""
    per = {k: float(np.sqrt(np.mean(v**2))) for k, v in res.items() if len(v)}
    allr = np.concatenate([v for v in res.values() if len(v)])
    q = np.quantile(list(per.values()), [0.5, 0.9])
    return {
        "buildings": len(per),
        "pixels": int(len(allr)),
        "rmse_m": float(np.sqrt(np.mean(allr**2))),
        "bias_m": float(allr.mean()),
        "building_rmse_p50_m": float(q[0]),
        "building_rmse_p90_m": float(q[1]),
        "pct_buildings_under_0_5m": 100 * float(np.mean(np.array(list(per.values())) < 0.5)),
    }


def val3dity_summary(report: Path) -> dict:
    """Solid and building validity from a val3dity JSON report (`-r`)."""
    r = json.loads(report.read_text())
    solids = next(p for p in r["primitives_overview"] if p["type"] == "Solid")
    b = r["features_overview"][0]
    return {
        "solids": solids["total"],
        "solids_valid": solids["valid"],
        "pct_solids_valid": 100 * solids["valid"] / solids["total"],
        "buildings": b["total"],
        "buildings_valid": b["valid"],
        "errors": r["all_errors"],
    }


def diff_stats(lod2, lod1) -> dict:
    """LoD2 minus LoD1 (aligned pandas Series): bias, MAE, median and p90 of |difference|, correlation."""
    d = (lod2 - lod1).dropna()
    a = d.abs()
    return {
        "n": int(len(d)),
        "bias_m": float(d.mean()),
        "mae_m": float(a.mean()),
        "median_abs_m": float(a.median()),
        "p90_abs_m": float(a.quantile(0.9)),
        "corr": float(lod2.corr(lod1)),
    }


def building_table(feats: list[dict]) -> pd.DataFrame:
    """One row per building: roofer attributes (rf_*) plus LoD2 roof max z (ODN) from the RoofSurface faces."""
    rows = []
    for f in feats:
        a = f["CityObjects"][f["id"]]["attributes"]
        z = [o[:, 2].max() for _, o, _ in roof_faces(f)]
        rows.append({"building_id": f["id"], **a, "roof_zmax": max(z) if z else np.nan})
    return pd.DataFrame(rows).set_index("building_id")
