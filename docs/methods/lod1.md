# LoD1 buildings: method and QA

Licence: CC BY 4.0. Pipeline: `make lod1` (`MODE=sample` one 1 km tile, `MODE=aoi` all of Glasgow City + 500 m).
Code: `pipelines/`. Data sources and checks: `docs/data-verification.md`.

## Method

1. **AOI** (`aoi.py`): OS Boundary-Line "Glasgow City" (S12000049, 176.4 km2) buffered 500 m = 224.1 km2.
2. **LiDAR** (`lidar.py`): Scottish LiDAR Phase 5 DSM and DTM, 50 cm, EPSG:27700, ODN heights, flown
   2020-05-28 to 2021-04-12. 17 tiles each, 13.4 GB, resumable download from the public SRSP S3 bucket.
3. **Rasters** (`rasters.py`): `gdalbuildvrt` mosaics; nDSM = max(DSM - DTM, 0) computed block-wise; COGs for nDSM, DTM
   and hillshade. Steps are skipped when their output is newer than the inputs.
4. **Footprints** (`footprints.py`): OS OpenMap Local `Building` layer (grid NS), whole buildings intersecting the AOI;
   MultiPolygons exploded (parts get a `-n` id suffix); source Z = 0 dropped. `ImportantBuilding` is not used because it
   duplicates polygons already in `Building`.
5. **Heights** (`heights.py`, `exactextract`, coverage-weighted): per footprint nDSM p50/p70/p90/max, DTM p10 as
   `ground_z_odn`, footprint area, `valid_px_ratio`. **LoD1 height = h_p70.** If h_p70 < 2 m but h_p90 >= 2 m (a small
   footprint that only partly overlaps its roof) the height is h_p90; if neither reaches 2 m, or there are no valid
   pixels, the height is the 6 m default and `height_source = default`. `lidar_year` = 2020 (start of the acquisition
   window).
6. **Vertical datum** (`datum.py`): `ground_z_ellip` = ODN height + OSGM15 geoid undulation (about 54 m in Glasgow)
   through PROJ with the OS OSTN15/OSGM15 grids. Tested against the 29 official OS vectors for GB mainland
   (`tests/test_datum.py`): max error 2 mm height, 7 mm position.
7. **3D Tiles** (`tiles.py`, `db/lod1.sql`): footprints are reprojected 27700 -> 4326 on the host with OSTN15
   (the stock PostGIS image would use a Helmert shift about 1 m off), loaded into PostGIS, extruded in SQL (walls plus
   flat roof, base = `ground_z_ellip`, top = base + height), and tiled with pg2b3dm 2.27 (implicit quadtree, 500
   features per tile, root geometric error 1500) with metadata in `EXT_structural_metadata`.
   Validated with `3d-tiles-validator` in a Node 22 container.

## Results, full city (`make lod1 MODE=aoi`, 2026-10-01)

| Quantity | Value |
|---|---|
| Footprints selected | 81,131 |
| In tileset (completeness) | 81,131 (100.00%; gate is 98%) |
| Dropped for no DTM pixel | 0 |
| `height_source = default` | 2,424 (2.99%), median footprint area 91 m2 |
| Used the h_p90 fallback | 416 (0.5%) |
| Height, lidar+default (m) | median 7.2, p90 9.9, p99 18.6, max 70.1 |
| Tileset | 389 content tiles, 90.1 MB (87 MB on disk), none over 0.76 MB |
| `3d-tiles-validator` | 0 errors, 0 warnings |
| Runtime | rasters about 8 min, heights 70 s, tiles 3 min (after the LiDAR download) |

Sample (1 km, George Square): 179 buildings, 1.12% default, 359 KB.

## Known limitations

- **Towers on podiums are underestimated.** h_p70 is a robust "main body" height, but footprints that combine a podium
  and a tower get the podium height (e.g. Hilton Glasgow h_p70 16.6 m vs h_max 72.3 m; St Andrew House 15.2 vs 70.6 m).
  `h_max` and `h_p90` are in the tileset metadata for styling; fixing the geometry needs building parts (LoD2, Phase 4).
- LiDAR is 2020-21: later buildings and demolitions are not reflected (`lidar_year`).
- Flat roofs; no bridges, tunnels or overhangs; heights are relative to the footprint's DTM p10.
- Default-height buildings are mostly small sheds and outbuildings or footprints that no longer match the ground.

## Landmark comparison

h_max (nDSM maximum inside the footprint, so it includes spires, plant and aerials) against published roof or overall
heights. Published figures are from the Wikipedia "List of tallest buildings and structures in Glasgow" and the
individual building pages (St Andrew House, Livingstone Tower); they use different conventions, so only differences of
a few metres are meaningful.

| Landmark | Published height (m) and convention | Matched footprint | h_max (m) | Difference | h_p70 (LoD1 height) |
|---|---|---|---|---|---|
| University of Glasgow Tower (Gilbert Scott Building) | 85, including the spire | 500BFDF0 (54 m from the reference point, 14,428 m2) | 85.4 | +0.4 | 22.1 |
| Glasgow City Chambers | 73, Victorian tower (convention not stated) | 7471CE2A (19 m, 10,580 m2) | 70.9 | -2.1 | 26.0 |
| St Andrew House, 141 West Nile St | 71, roof height | A6D3F3C3 (0 m, 2,149 m2) | 70.6 | -0.4 | 15.2 |
| Hilton Glasgow, 1 William St | 70, no convention stated | 29DFCFEB (0 m, 3,672 m2) | 72.3 | +2.3 | 16.6 |
| Livingstone Tower (Strathclyde) | about 52, "estimated" roof height | 79C0D6C9 (0 m, 955 m2) | 63.2 | +11.2 | 55.7 |

Notes. Four of five agree within 2.3 m. Livingstone Tower is an outlier by +11 m: the published figure is explicitly an
estimate; the LiDAR p70 (55.7 m) is also above it, so lift-motor rooms alone do not explain it, and the real height of
this building on a slope was not independently verified. Met Tower (published 74.7 m roof) is **not** in the table:
the coordinates I found are about 100 m off and several 60-80 m towers (including Townhead blocks) sit within that
radius, so I could not match it to a footprint without guessing. Landmark footprints were matched by distance from the
published coordinates and by footprint area; none of the matches was checked visually.

## Terrain

Cesium World Terrain is about 14 m above the LiDAR ground in central Glasgow, so the pipeline builds its own
quantized-mesh terrain (`make terrain`, ADR-002). Full city: 88,749 tiles (zoom 0-17), 349 MB, bounds
-4.5156 55.7454 -3.9619 55.9697, 2 m source. Read back from the generated tiles at five spread-out buildings,
terrain minus `ground_z_ellip` is +0.10, +0.42, +0.20, -0.04 and -0.01 m (max 0.42 m).
