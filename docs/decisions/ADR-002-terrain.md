# ADR-002: Terrain, interim ion terrain replaced by our own in Phase 1

Status: accepted (Phase 1, supersedes the Phase 2 plan in the roadmap). Licence: CC BY 4.0.

## Context

The roadmap planned Cesium World Terrain (ion) as interim terrain and our own terrain in Phase 2. Testing with a real
token showed ion terrain sits about 14 m above the LiDAR ground in central Glasgow (4 to 26 m across the sample),
so every LoD1 base (ellipsoidal height from the same DTM) looked sunk. Checks that the LiDAR side is right:

- Raw Phase 5 DTM: George Square 11.6 m ODN, River Clyde at Glasgow Bridge -1.2 m ODN (both plausible).
- Datum: ODN to ETRS89 ellipsoidal via OSGM15 passes the 29 official OS OSTN15/OSGM15 vectors (max 2 mm).
- The new terrain below, built from the same DTM and geoid, matches `ground_z_ellip` within 0.3 m.

## Decision

Build our own terrain in the pipeline (`make terrain`, `pipelines/terrain.py`):

1. DTM mosaic (EPSG:27700, ODN) resampled to about 2 m in EPSG:4326 (gdalwarp, average) over the DTM tile union plus
   2 km, voids and padding filled by nearest-value extrapolation so the terrain does not fall off at the edge.
2. Add the OSGM15 geoid undulation (`uk_os_OSGM15_GB.tif`, same grid the datum module uses) to get ETRS89
   ellipsoidal height.
3. `ctb-tile -f Mesh -C -N` (tumgis/ctb-quantized-mesh, Docker, quantized-mesh 1.0 with vertex normals), up to zoom 17.
   `layer.json` bounds are rewritten to the real extent (ctb reports a misleading one).
4. `pipelines/terrain_check.py` decodes heights back out of the generated tiles and compares with `ground_z_ellip`.

Viewers load `build/<mode>/terrain/` (later on R2) as a quantized-mesh provider; ion terrain stays only as an
optional comparison. Outside the padded extent there is no terrain (ellipsoid), so use it for the AOI view only.

## Consequences

- Buildings and ground come from one DTM and one geoid, so they cannot disagree vertically.
- Horizontal placement: buildings are reprojected 27700 to 4326 on the host with the OSTN15 grid (`ogr2ogr -t_srs`),
  because the stock PostGIS image has no OS grids and falls back to a Helmert shift that is about 1 m off.
- Terrain is limited to the DTM extent; about 2 m resolution, flat roofs and ground only (no bridges, tunnels, water).
- ADR-004 corrected: the ground-height mismatch was the ion terrain, not the pipeline.
