# SPDX-License-Identifier: AGPL-3.0-or-later
"""Download OS OpenData products (Boundary-Line, OpenMap Local) via the OS Data Hub downloads API (no key)."""

import zipfile
from pathlib import Path

import requests

from . import config
from .download import fetch


def _find(cfg: dict, product: str, **match) -> dict:
    r = requests.get(f"{cfg['os']['downloads_api']}/{product}/downloads", timeout=60)
    r.raise_for_status()
    for d in r.json():
        if all(d.get(k) == v for k, v in match.items()):
            return d
    raise LookupError(f"{product} {match} not offered by the OS downloads API")


def get(cfg: dict, product: str, **match) -> Path:
    """Download + extract a product; returns the extraction directory."""
    raw = config.resolve(cfg["os"]["raw_dir"])
    d = _find(cfg, product, **match)
    zip_path = fetch(d["url"], raw / d["fileName"], d["size"])
    out = raw / zip_path.stem
    if not out.exists():
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(out)
    return out


def boundary_line(cfg: dict) -> Path:
    # GML is the smallest GB-wide offer (168 MB vs 808 MB GPKG)
    return get(cfg, "BoundaryLine", area="GB", format="GML", subformat="3") / "Data"


def openmap_local(cfg: dict) -> Path:
    sq = cfg["os"]["grid_square"]
    return get(cfg, "OpenMapLocal", area=sq, format="ESRI® Shapefile")
