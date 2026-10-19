# SPDX-License-Identifier: AGPL-3.0-or-later
"""Numbers for docs/methods/lod2.md from one roofer run: LoD1 vs LoD2 heights and the landmark table.

Usage: python -m pipelines.lod2_report <run>      (prints JSON)
"""

import json
import sys

import geopandas as gpd

from . import config, lod2, lod2_qa

# Landmarks in the pilot box, matched in docs/methods/lod1.md; published heights as listed there.
LANDMARKS = {
    "Glasgow City Chambers": ("7471CE2A", 73),
    "St Andrew House": ("A6D3F3C3", 71),
    "Livingstone Tower": ("79C0D6C9", 52),
}


def report(run: str) -> dict:
    feats = lod2_qa.read_cjseq(next((lod2.pdir() / run).glob("*.city.jsonl")))
    t = lod2_qa.building_table(feats)
    ok = t[(t.rf_extrusion_mode == "standard") & t.roof_zmax.notna()].copy()
    h1 = gpd.read_file(config.build_dir("aoi") / "heights.gpkg", ignore_geometry=True).set_index(
        "building_id"
    )
    ok = ok.join(
        h1[["height", "h_max", "h_p90", "ground_z_odn", "area_m2", "height_source"]], how="inner"
    )
    ok["lod2_max"] = ok.roof_zmax - ok.rf_h_ground
    ok["lod2_p70"] = ok.rf_h_roof_70p - ok.rf_h_ground
    lid = ok[ok.height_source == "lidar"]
    out = {
        "modes": t.rf_extrusion_mode.value_counts().to_dict(),
        "p70_vs_lod1_height": lod2_qa.diff_stats(lid.lod2_p70, lid.height),
        "max_vs_lod1_hmax": lod2_qa.diff_stats(lid.lod2_max, lid.h_max),
        "volume_lod2_vs_lod1_extrusion_pct": float(
            100 * (lid.rf_volume_lod22.sum() / (lid.area_m2 * lid.height).sum() - 1)
        ),
        "landmarks": {},
    }
    for name, (pre, pub) in LANDMARKS.items():
        r = ok[ok.index.str.startswith(pre)]
        if len(r):
            r = r.iloc[0]
            out["landmarks"][name] = {
                "published_m": pub, "lod2_max_m": round(float(r.lod2_max), 1),
                "lod1_hmax_m": round(float(r.h_max), 1), "lod1_height_m": round(float(r.height), 1),
                "lod2_vs_published_m": round(float(r.lod2_max - pub), 1),
            }  # fmt: skip
        else:
            out["landmarks"][name] = "not reconstructed"
    return out


if __name__ == "__main__":
    print(json.dumps(report(sys.argv[1]), indent=1))
