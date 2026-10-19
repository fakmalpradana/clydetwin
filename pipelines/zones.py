# SPDX-License-Identifier: AGPL-3.0-or-later
"""B7: Data Zones 2022 + SIMD 2020v2 + mid-2024 population, as a choropleth GeoJSON and a building -> zone key.

SIMD 2020v2 is published for the 2011 Data Zones and there is no official lookup to the 2022 zones (NRS and the
Scottish Government say so). We build one: each 2022 zone takes the area-weighted mean SIMD rank of the 2011 zones it
overlaps (intersection areas in EPSG:27700). `simd_dominant_share` is the share of the 2022 zone covered by its
largest 2011 zone: 1.0 means a 1:1 match, below about 0.8 the zone was split or merged and the SIMD value is blurred.
Sources (all OGL v3): SG Data Zone Boundaries 2011 and 2022, SIMD 2020v2 (opendata.nhs.scot), NRS small area
population estimates mid-2024 (2022 data zones).
Output: data_zones.geojson (EPSG:4326, zones that contain or touch a building) and part_zones.parquet (data_zone).
"""

import geopandas as gpd
import numpy as np
import pandas as pd

from . import config

N_ZONES_2011 = 6976  # SIMD 2020v2 ranks 1 (most deprived) to 6,976


def decile(rank: pd.Series) -> pd.Series:
    """SIMD national decile 1 (most deprived 10%) to 10 from a 1..6976 rank."""
    return np.clip(np.ceil(rank / (N_ZONES_2011 / 10)), 1, 10).astype("Int8")


def simd_to_2022(z22: gpd.GeoDataFrame, z11: gpd.GeoDataFrame) -> pd.DataFrame:
    """z22: dz22, geometry; z11: dz11, simd_rank, geometry -> per 2022 zone weighted rank and dominant share."""
    i = gpd.overlay(
        z22[["dz22", "geometry"]],
        z11[["dz11", "simd_rank", "geometry"]],
        how="intersection",
        keep_geom_type=True,
    )
    i["a"] = i.geometry.area
    i = i[i.a > 1.0]  # slivers from boundary mismatch
    tot = i.groupby("dz22").a.transform("sum")
    i["w"] = i.a / tot
    g = i.assign(wr=i.w * i.simd_rank).groupby("dz22")
    out = pd.DataFrame({"simd_rank": g.wr.sum().round(), "simd_dominant_share": g.w.max().round(3)})
    out["simd_decile"] = decile(out.simd_rank)
    return out.reset_index()


def run(cfg: dict | None = None) -> pd.DataFrame:
    cfg = cfg or config.load()
    raw = config.resolve(cfg["analytics"]["raw_dir"])
    bld = gpd.read_file(config.analytics_heights(cfg), columns=["building_id"])
    z22 = gpd.read_file(raw / "dz/2022/SG_DataZone_Bdry_2022.shp", bbox=tuple(bld.total_bounds))
    z22 = z22.rename(columns={"dzcode": "dz22", "dzname": "name", "stdareakm2": "area_km2"})
    z11 = gpd.read_file(raw / "dz/2011/SG_DataZone_Bdry_2011.shp", bbox=tuple(bld.total_bounds))
    simd = pd.read_csv(raw / "simd/simd2020v2.csv", usecols=["DataZone", "SIMD2020V2Rank"])
    z11 = z11.rename(columns={"DataZone": "dz11"}).merge(
        simd.rename(columns={"DataZone": "dz11", "SIMD2020V2Rank": "simd_rank"}), on="dz11"
    )
    pop = pd.read_excel(raw / "pop/SAPE 2024.xlsx", sheet_name="2024", header=2, usecols=[0, 4, 5])
    pop = pop[pop.Sex == "Persons"].rename(
        columns={"Data zone code": "dz22", "Total population": "pop_2024"}
    )[["dz22", "pop_2024"]]
    # building -> zone by representative point; keep zones that hold a building
    rp = gpd.GeoDataFrame(
        bld[["building_id"]], geometry=bld.geometry.representative_point(), crs=bld.crs
    )
    j = rp.sjoin(z22[["dz22", "geometry"]], how="left").drop_duplicates("building_id")
    z22 = z22[z22.dz22.isin(j.dz22.dropna())]
    z = z22.merge(simd_to_2022(z22, z11), on="dz22").merge(pop, on="dz22", how="left")
    z["pop_density_km2"] = (z.pop_2024 / z.area_km2).round(0)
    keep = ["dz22", "name", "pop_2024", "area_km2", "pop_density_km2", "simd_rank", "simd_decile",
            "simd_dominant_share", "geometry"]  # fmt: skip
    out = config.analytics_out(cfg)
    z[keep].round({"area_km2": 3}).to_crs(4326).to_file(
        out / "data_zones.geojson", driver="GeoJSON", COORDINATE_PRECISION=6
    )
    part = pd.DataFrame({"building_id": j.building_id, "data_zone": j.dz22.values})
    part.to_parquet(out / "part_zones.parquet", index=False)
    config.log(
        f"zones: {len(z)} DZ2022 in the AOI, {part.data_zone.notna().mean():.2%} of buildings keyed; "
        f"simd_dominant_share < 0.8 for {(z.simd_dominant_share < 0.8).sum()} zones; "
        f"pop_2024 null {z.pop_2024.isna().sum()}"
    )
    return z


if __name__ == "__main__":
    run()
