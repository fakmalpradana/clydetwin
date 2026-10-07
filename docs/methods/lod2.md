# LoD2 pilot (City Centre / Merchant City): method and validation

Licence: CC BY 4.0. Code: `pipelines/lod2*.py`. Pilot box (EPSG:27700): E258500-260500, N664500-666500 (2 x 2 km,
George Square to Merchant City), set in `pipelines/config.yaml` (`pilot`). 722 OpenMap Local footprints.

## Method

1. **Point cloud** (`python -m pipelines.lidar laz`): Scottish LiDAR Phase 5 LAZ (collection
   `scotland-gov/lidar/phase-5/laz`, 1 km tiles, 4 pts/m2, same 2020-21 flight as the DSM/DTM, OGL v3), 9 tiles,
   361 MB. Resumable, size-checked, sha256 in `data/raw/lidar/laz/SHA256SUMS`. No CRS in the LAS headers: EPSG:27700,
   ODN heights assumed (consistent with the DSM).
2. **PDAL** (2.10.2) (`python -m pipelines.lod2 prep`): the LAZ has only classes 1 and 2, no roof class. Points are cropped to
   footprints + 10 m, height above ground is computed (`filters.hag_nn`), and non-ground points inside a footprint
   and >= 1.5 m above ground become class 6 (what roofer reads as roof). 9.67 M points, 81 MB.
3. **roofer** per footprint, LoD2.2 CityJSONSeq. Parameters chosen by the grid below: `complexity_factor 0.3`,
   `cellsize 1.0` (default 0.5 reads 37% of cells as empty at 4 pts/m2), `lod11_fallback_time 120000` ms,
   `cj_scale 0.0001`.
4. **val3dity** 2.7.0, defaults (snap 1 mm, planarity 0.01 m / 20 deg).
5. **Heights**: tiles use OSTN15 + OSGM15 per vertex (`datum.odn_to_ellipsoidal`), the same code as LoD1, so a LoD2
   roof sits where the LoD1 extrusion of the same footprint did.

## Tool versions

| Tool | Version | How |
|---|---|---|
| roofer | v1.0.0 (amd64, emulated) for the grid; **v1.1.0-beta.1 (native arm64) for the published run** | Docker Hub `3dgi/roofer`; digests in `pipelines/lod2.py` (v1.0.0 `sha256:dd2c415a...c251d2`, v1.1.0-beta.1 index `sha256:476b5f4b...4689e99`) |
| PDAL | 2.10.2 | `pdal/pdal@sha256:23fab8b5...e40d1` |
| val3dity | 2.7.0, commit fbe9e4d | no official image or arm64 binary: built from the tag with the PyPI cmake and Homebrew CGAL/GEOS (`build/tools/val3dity`); the Homebrew tap needs a trust setting that was not changed |
| pg2b3dm | 2.27.0 | `geodan/pg2b3dm@sha256:318d19d0...6a559f` (linux/amd64), as LoD1 |
| 3d-tiles-validator | via `node:22-slim` `npx` | as LoD1 |
| convertwin | not used | the local image is a Celery/Redis/MinIO job service taking CityGML; going CityJSON to CityGML to tiles would add two lossy conversions and bypass the OSGM15 datum step, so pg2b3dm (the brief's fallback) was used |

## Parameter grid (small, one factor at a time then complexity sweep)

Scored by `pipelines/lod2_grid.py`; table in `build/pilot/grid.json`. "Per-bld median" = median over buildings of the
roof-vs-DSM RMSE; "pixel RMSE" = RMSE over all roof pixels.

| Run | roofer | Parameters | Reconstructed | Valid solids | Pixel RMSE | Per-bld median RMSE |
|---|---|---|---|---|---|---|
| default | 1.0.0 | defaults | 678 | 74.2% | 3.51 m | 0.98 m |
| cell1 | 1.0.0 | cellsize 1.0 | 675 | 74.2% | 3.71 | 0.98 |
| cell1_eps15 | 1.0.0 | + plane epsilon 0.15 | 675 | 75.5% | 3.96 | 1.01 |
| cx6 | 1.0.0 | complexity 0.6 | 675 | 88.7% | 3.71 | 1.07 |
| cx5_eps5 | 1.0.0 | complexity 0.5, epsilon 0.5 | 675 | 91.4% | 3.68 | 1.14 |
| cx4 | 1.0.0 | complexity 0.4 | 675 | 94.3% | 3.76 | 1.24 |
| cx3 | 1.0.0 | complexity 0.3 | 675 | 96.6% | 3.82 | 1.48 |
| cx2 | 1.0.0 | complexity 0.2 | 675 | 97.9% | 3.90 | 1.93 |
| **cx3_beta** | **1.1.0-beta.1** | complexity 0.3 | **690** | **100%** | 3.85 | **1.45** |

Selection rule: >= 95% valid with the lowest per-building median RMSE. Lower complexity buys validity at the cost of
roof detail. The beta gives the same RMSE with every solid valid and 15 more buildings reconstructed, so it is the
published run (`build/pilot/cx3_beta`). Two runs with `plane_detect_min_points 8`/`k 10` never finished in time and
were stopped (region growing explosion); not in the table.

## Results (published run, cx3_beta)

| Quantity | Value |
|---|---|
| Footprints | 722 |
| roofer `standard` LoD2.2 | 690 (95.6%) |
| LoD1.1 fallback (time limit) | 10 |
| Skipped (insufficient point cloud, no model; these stay LoD1) | 22 |
| val3dity, LoD2.2 solids | 699 of 699 valid (100%); buildings 722 of 722 (gate 95%: **met**) |
| Roof vs DSM, per-building median RMSE (primary) | 1.45 m; p90 4.02 m |
| Buildings with roof RMSE < 1 m / < 2 m | 35.2% / 64.7% |
| Roof vs DSM, pixel-weighted RMSE (4.14 M px) | 3.85 m, bias -0.23 m |
| Median absolute residual | 0.21 m; 60.5% of pixels within 0.5 m; p90 3.21 m |

**The 0.5 m roof RMSE target is not met.** Reading: the typical roof pixel is close (median 0.21 m) but a minority of
large, complex buildings is far off and dominates both RMSE figures. The pixel-weighted metric is dominated by
podium/tower flattening and was a mis-specified gate; the per-building median is the primary figure. Causes: the cloud
is 4 pts/m2 (roofer is built around denser clouds), the OpenMap footprints are generalised and not roofprints, and
tall towers on podiums lose their upper part (see landmarks). Residual = LoD2 roof plane minus DSM at each 0.5 m DSM pixel inside
each RoofSurface face eroded by 0.5 m (`lod2_qa.py`); the DSM comes from the same flight, so it is not independent of
the point cloud. NGD / Digimap BHA validation (RMSE < 2 m) is not done: pending an account.

## LoD1 vs LoD2 (686 buildings with a LiDAR-derived LoD1 height)

| Comparison | Bias | Median abs | p90 abs | Correlation |
|---|---|---|---|---|
| LoD2 h_roof_70p above ground vs LoD1 height (h_p70) | +0.55 m | 0.66 m | 2.99 m | 0.95 |
| LoD2 roof max vs LoD1 h_max | -2.10 m | 1.60 m | 6.47 m | 0.88 |

LoD2 volume is 5.7% below the LoD1 extrusion volume (area x height) over the same buildings. LoD1 h_max is the nDSM
maximum (spires, plant, aerials); roofer removes much of this, hence the negative bias.

## Landmarks (LoD2 maximum height above ground)

| Landmark | Published (m) | LoD2 max | LoD1 h_max | LoD1 height | LoD2 - published |
|---|---|---|---|---|---|
| Glasgow City Chambers (7471CE2A) | 73 (Victorian tower) | 33.8 | 70.9 | 26.0 | **-39.2 m** |
| St Andrew House (A6D3F3C3) | 71 (roof) | 69.0 | 70.6 | 15.2 | -2.0 m |
| Livingstone Tower (79C0D6C9) | about 52 (estimate) | 61.5 | 63.2 | 55.7 | +9.5 m |

University of Glasgow Tower and Hilton lie outside the pilot box. Published figures use different conventions (see
`lod1.md`); only differences of a few metres are meaningful. St Andrew House is the success: LoD1 gave it the podium
height (15 m) and LoD2 recovers the tower. **City Chambers is a failure:** the central tower is lost and the model tops
out at 33.8 m although the DSM shows about 70 m. This is the known podium/tower limitation: roofer builds one roof
surface per height-field cell, and a thin tower inside a large complex footprint is treated as an outlier or merged into
the lower roof. The same effect drives the heavy tail of the roof RMSE. Buildings like this are better served by LoD1
`h_max` styling; they are in the tileset but should not be presented as accurate towers.

## Tiles

`python -m pipelines.lod2_tiles cx3_beta` (needs `COMPOSE_PROJECT_NAME=ctwin-tiles POSTGRES_PORT=<free port>`, never
the live stack). Faces (walls and roofs, no floor) go into PostGIS as MultiPolygonZ in ETRS89 lon/lat/ellipsoidal
height, pg2b3dm 2.27.0 tiles them (max 100 features per tile, root error 1500). Metadata is the LoD1 field set
(`building_id, height, h_max, h_p90, ground_z_odn, ground_z_ellip, area_m2, height_source, lidar_year`, taken from the
LoD1 heights table so styling is identical) plus `lod = 2`. 696 buildings in 16 tiles (7.0 MB, 0 validator errors). Published to R2 `lod2/v1/`; `lod2/v1/pilot_ids.json` is the
list of `building_id`s that have LoD2 geometry: the web hides LoD1 features with these ids inside the pilot. LoD1
stays in place everywhere else (and for the 32 pilot buildings without LoD2).

## Triangulation and QA gate (v3, v4)

**Triangulation (robustness fix, v3).** Up to `lod2/v2` faces went to PostGIS as 3D polygons in lon/lat degrees plus
ellipsoidal metres and pg2b3dm triangulated each after projecting onto a plane from those mixed units, which can
triangulate across the gaps of concave or holed faces. `pipelines/lod2_tiles.triangulate_face` now triangulates every
non-ground face in metres (BNG + ODN z, Newell-plane basis, `shapely.constrained_delaunay_triangles`, centroids outside
the face dropped, triangles under 1e-4 m2 dropped, outward winding) before the datum step, and the tile source is a
MultiPolygon of triangles. Area check (`tests/test_lod2_tri.py`): synthetic L wall, sloped concave roof and holed face
within 1e-6 relative; on the 696 pilot buildings (25,847 faces) the triangle 3D area equals the source face area with a
maximum per-building deviation of 3.8e-5 %. Triangle count is unchanged (79,323). **This did not remove the visible
spikes and shards**: those were not a triangulation fault.

**Real cause: roofer plane extrapolation.** In some buildings a slanted roof plane is extrapolated into a wedge: one tip
shoots far above the LiDAR top (the spike) and the low end dives toward the ground (the shards). Example 2729F348: a
RoofSurface spans 9.1 to 75.8 m ODN while the LiDAR top is about 39.4 m.

**QA gate (v4).** `qa_reason` in `pipelines/lod2_tiles.py`, thresholds in `config.yaml` `lod2.qa`: a building's LoD2 is
rejected if any RoofSurface vertex is above `ground_z_odn + h_max + 3.0 m` (`above_lidar`), or below `ground_z_odn +
1.0 m` when `h_p70 > 4 m` (`reaches_ground`). Of the 696 buildings with LoD2 geometry, **35 are rejected (19
`above_lidar`, 16 `reaches_ground`)** and 661 are kept. Rejected ids and reasons go to `build/pilot/lod2_qa_rejects.csv`;
they are left out of the tiles and of `pilot_ids.json`, so LoD1 shows for them. Published to R2 `lod2/v4/` (16 tiles).

**Quality figures.** The val3dity (699 of 699 solids valid) and roof-RMSE figures above (1.45 m per-building median,
3.85 m pixel-weighted) are for all roofer buildings, before the gate; they were not recomputed on the 661 kept
buildings.
