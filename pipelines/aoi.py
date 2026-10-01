# SPDX-License-Identifier: AGPL-3.0-or-later
"""Task 1.3: area of interest = authority boundary (OS Boundary-Line, OGL) + buffer, -> data/aoi.gpkg."""

import geopandas as gpd
from shapely.geometry import box
from shapely.ops import unary_union

from . import config, os_data


def build(cfg: dict) -> gpd.GeoDataFrame:
    gml = os_data.boundary_line(cfg) / "INSPIRE_AdministrativeUnit.gml"
    units = gpd.read_file(
        gml, layer="AdministrativeUnit", where=f"text = '{cfg['aoi']['authority']}'"
    )
    if len(units) != 1:
        raise LookupError(f"expected exactly one '{cfg['aoi']['authority']}', got {len(units)}")
    extra = [box(*e["bbox"]) for e in cfg["aoi"].get("extra", [])]
    geom = unary_union([units.geometry.iloc[0].buffer(cfg["aoi"]["buffer_m"]), *extra])
    aoi = gpd.GeoDataFrame(
        {"authority": [cfg["aoi"]["authority"]], "buffer_m": [cfg["aoi"]["buffer_m"]]},
        geometry=[geom],
        crs=cfg["crs"],
    )
    out = config.resolve(cfg["aoi"]["path"])
    out.parent.mkdir(parents=True, exist_ok=True)
    aoi.to_file(out, driver="GPKG", layer="aoi")
    return aoi


if __name__ == "__main__":
    a = build(config.load())
    print(f"AOI area {a.area.iloc[0] / 1e6:.1f} km2, bounds {a.total_bounds}")
