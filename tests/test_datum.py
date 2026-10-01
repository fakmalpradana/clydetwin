# SPDX-License-Identifier: AGPL-3.0-or-later
"""Check ODN -> ETRS89 ellipsoidal conversion against the official OS OSTN15/OSGM15 test vectors."""

import csv
from pathlib import Path

import numpy as np
import pytest

from pipelines.datum import odn_to_ellipsoidal

FIXTURE = Path(__file__).parent / "fixtures" / "os_ostn15_osgm15_osgb_to_etrs.csv"
# Flag 1 = GB mainland ODN (Glasgow). Island datums (Orkney, Shetland, ...) are outside the GB grid.
ROWS = [r for r in csv.DictReader(open(FIXTURE)) if r["datum_flag"] == "1"]


@pytest.mark.parametrize("row", ROWS, ids=[r["point"] for r in ROWS])
def test_official_vectors(row):
    lon, lat, h = odn_to_ellipsoidal(
        float(row["easting"]), float(row["northing"]), float(row["h_odn"])
    )
    # OS publishes results to 1e-11 deg / 1e-4 m; the PROJ NTv2/GTX derivatives agree to mm (observed max: 2 mm height, 7 mm position).
    assert abs(lat - float(row["lat"])) * 111_000 < 0.015
    assert abs(lon - float(row["lon"])) * 111_000 * np.cos(np.radians(lat)) < 0.015
    assert abs(h - float(row["h_ellipsoidal"])) < 0.005
