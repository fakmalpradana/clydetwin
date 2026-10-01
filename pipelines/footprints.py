# SPDX-License-Identifier: AGPL-3.0-or-later
"""Task 1.5: OS OpenMap Local buildings, restricted to the AOI (or the sample box)."""

import geopandas as gpd
import shapely
from shapely.geometry import box

from . import config, os_data


def build(mode: str, cfg: dict | None = None) -> gpd.GeoDataFrame:
    cfg = cfg or config.load()
    shp = (
        os_data.openmap_local(cfg)
        / "OS OpenMap Local (ESRI Shape File) NS"
        / "data"
        / f"{cfg['os']['grid_square']}_Building.shp"
    )
    if mode == "sample":
        # whole buildings inside the box: edge buildings would otherwise get truncated LiDAR stats
        area = box(*cfg["sample"]["bbox"])
        pred = "within"
    else:
        area = gpd.read_file(config.resolve(cfg["aoi"]["path"])).geometry.iloc[0]
        pred = "intersects"  # whole buildings touching the AOI buffer
    g = gpd.read_file(shp, bbox=tuple(area.bounds))
    g = g[getattr(g.geometry, pred)(area)]
    g = g.assign(geometry=shapely.force_2d(g.geometry.values))  # source polygons carry Z = 0
    g = g[~g.geometry.is_empty & g.geometry.notna()]
    g["geometry"] = shapely.make_valid(g.geometry.values)
    g = g.rename(columns={"ID": "building_id"})[["building_id", "geometry"]].reset_index(drop=True)
    assert g.building_id.is_unique
    g = g.set_crs(cfg["crs"], allow_override=True)
    out = config.build_dir(mode) / "footprints.gpkg"
    g.to_file(out, driver="GPKG", layer="footprints")
    return g


if __name__ == "__main__":
    import sys

    g = build(sys.argv[1] if len(sys.argv) > 1 else "sample")
    print(len(g), "footprints", g.geom_type.value_counts().to_dict())
