# SPDX-License-Identifier: AGPL-3.0-or-later
"""Counts of LoD1 buildings by SEPA flood likelihood -> public/scenarios/flood_counts.json (static fixture for /scenarios/flood).
Run from the repo root after `make analytics`:  uv run python web/scripts/flood_counts.py [buildings_attrs.parquet]"""

import json
import sys
from pathlib import Path

import pandas as pd

src = Path(sys.argv[1] if len(sys.argv) > 1 else "build/analytics/buildings_attrs.parquet")
d = pd.read_parquet(src, columns=["flood_river", "flood_coastal", "flood_surface", "flood_max"])
levels = ["high", "medium", "low", "none"]
out = {"buildings": len(d), "source": "SEPA Flood Maps v3 via analytics B3"}
for col in d.columns:
    vc = d[col].value_counts()
    out[col] = {k: int(vc.get(k, 0)) for k in levels}
dst = Path(__file__).resolve().parents[1] / "public/scenarios/flood_counts.json"
dst.write_text(json.dumps(out, indent=1) + "\n")
print(dst, out["flood_max"])
