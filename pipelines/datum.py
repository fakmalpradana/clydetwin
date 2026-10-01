# SPDX-License-Identifier: AGPL-3.0-or-later
"""Vertical datum: ODN (Newlyn, EPSG:5701) height -> ETRS89 ellipsoidal height (EPSG:4937).

Uses PROJ with the OS grids OSTN15 (horizontal) and OSGM15 (geoid) from cdn.proj.org.
Cesium and three.js both place geometry by ellipsoidal height, so LoD1 bases use this.
"""

import numpy as np
import pyproj
from pyproj import Transformer
from pyproj.datadir import append_data_dir

from . import config
from .download import fetch, sha256

GRIDS = {
    "uk_os_OSGM15_GB.tif": "bf0ac81f1c0c33332693d7d606f335b793c3c2995b8e69eeb1350bd94adcde3b",
    "uk_os_OSTN15_NTv2_OSGBtoETRS.tif": "5d6ed64d2119952c4c559fa1fccbc594b6520fc3ec3ef2fc10be13202c4384fa",
}
_transformer: Transformer | None = None


def ensure_grids() -> None:
    d = config.resolve("data/proj")
    for name, digest in GRIDS.items():
        p = fetch(f"https://cdn.proj.org/{name}", d / name)
        if sha256(p) != digest:
            raise OSError(f"checksum mismatch for {name}")
    append_data_dir(str(d))


def transformer() -> Transformer:
    global _transformer
    if _transformer is None:
        ensure_grids()
        pyproj.network.set_network_enabled(False)
        _transformer = Transformer.from_crs("EPSG:27700+5701", "EPSG:4937", always_xy=True)
    return _transformer


def odn_to_ellipsoidal(e, n, h_odn):
    """(easting, northing, ODN height) in EPSG:27700 -> (lon, lat, ETRS89 ellipsoidal height)."""
    return transformer().transform(np.asarray(e), np.asarray(n), np.asarray(h_odn))
