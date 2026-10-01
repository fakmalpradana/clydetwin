# CV and Upwork lines for ClydeTwin (Phase 1)

**DRAFT — needs Fairuz approval before use.** Nothing here has been added to the CV or the Upwork profile.

## CV bullets (pick one)

**Variant A, outcome first**

- Built ClydeTwin, an open-data 3D digital twin of Glasgow: all 81,131 buildings extruded from Scottish LiDAR (50 cm) and OS OpenMap Local into 3D Tiles 1.1 (389 tiles, 90 MB), served in CesiumJS and three.js viewers; validated with 0 `3d-tiles-validator` errors, datum conversion matching 29 OS test vectors to 2 mm, and 94% of sampled buildings within 2 m of own LiDAR-derived terrain.

**Variant B, method first**

- Developed a reproducible Python/PostGIS pipeline (nDSM, `exactextract` height percentiles, OSGM15 vertical datum, pg2b3dm, quantized-mesh terrain) that produces city-scale LoD1 buildings for Glasgow from open data; diagnosed Cesium ion terrain sitting about 14 m above the LiDAR ground and replaced it with terrain built from the same DTM and geoid (agreement within 0.4 m at five checked buildings).

## Upwork portfolio item

**Title:** City-scale 3D digital twin of Glasgow from open LiDAR (LoD1, 3D Tiles)

**Description (484 characters):**
Open-data 3D model of all 81,131 buildings in Glasgow City. Python/PostGIS pipeline turns Scottish LiDAR (50 cm) and OS footprints into validated 3D Tiles 1.1 with per-building metadata, plus own quantized-mesh terrain, vertical datum conversion checked against official OS test vectors, and two web viewers (CesiumJS, three.js). QA is published, including limits: towers on podiums are drawn short until LoD2, and 94% of buildings sit within 2 m of terrain. Demo and code are public.

**Skills:** Python, LiDAR, 3D Tiles, CesiumJS, three.js, PostGIS, QGIS, GDAL, 3D Digital Twin, Geospatial Data Processing, Vertical Datum / Coordinate Transformation

**Links to attach:** https://clydetwin.vercel.app · https://github.com/fakmalpradana/clydetwin
