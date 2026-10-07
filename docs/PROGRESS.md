# Progress

## Phase 1: Glasgow in 3D

Pipeline workstream A (branch `p1/pipeline`); web workstream B (branch `p1/web`). Status: todo / doing / done.

| Task | Description | Status |
|---|---|---|
| 1.1 | Scaffold | done |
| 1.2 | Data verification spike | done |
| 1.3 | AOI | done |
| 1.4 | Rasters (VRT, nDSM, COG) | done |
| 1.5 | Footprints | done |
| 1.6 | Heights (exactextract) | done |
| 1.7 | Vertical datum (ODN to ellipsoid) | done |
| 1.8 | 3D Tiles | done (sample + full city) |
| 7 | Own terrain (pulled forward from Phase 2) | done |
| 1.13 | Archive collector (SEPA KiWIS + Open-Meteo to R2) | Open-Meteo verified live; KiWIS untested live (429 credit limit) |
| 1.10 | Web: `/`, `/explore`, `/about/data`, `web/lib/` | done (full city, own terrain; `NEXT_PUBLIC_TERRAIN_URL`) |
| 1.11 | `/immersive` v0.1 (R3F, 3d-tiles-renderer, takram atmosphere); ADR-004 | done (full city, own terrain, 60 fps headless; real-GPU fps pending) |
| 1.10b | Basemap switcher (Carto, Esri, OSM, Google via Map Tiles API) in `/explore` and `/immersive` | done (Google path untested, no key) |
| 1.14 | README to the ROADMAP standard, media, CITATION | done (production URL and release badge pending the gate) |

## Phase 2: Glasgow Now

Backend workstream A (branch `p2/backend`); web workstream B (branch `p2/web`). Brief: `docs/phases/P2.md`.

| Task | Description | Status |
|---|---|---|
| A1 | `docker-compose.live.yml`: TimescaleDB+PostGIS, api, collectors, Caddy (db verified; api/collectors land in A4/A6) | done |
| A2 | Migrations: `db/migrations/*.sql` (ref, ts hypertable + compression, meta), `make migrate` runner, DB test fixtures, CI service container | done |
| A3 | `collectors/common.py`: backoff, pydantic validation, idempotent upsert, `meta.ingest_runs`, Healthchecks ping | done |
| A4 | Collectors: `weather` (Open-Meteo UKMO 3x3), `air_quality` (UK-AIR SOS API, ADR-007), `sepa` (KiWIS, 429-safe, off by default), scheduler `python -m collectors` | done (weather and air verified live; SEPA by fixtures only) |
| A5 | `make backfill` (R2 `raw/` NDJSON into the DB, idempotent) and a daily DB dump to R2 `dump/observations/` from the collectors container | done (backfill run against real R2: 2 objects, 63 new rows, second run 0) |
| A6 | FastAPI `api/main.py` implementing the P2 contract (health, stations, timeseries, now) + pytest against a seeded TimescaleDB; `make live-up` runs db+api+collectors locally (Caddy only when DOMAIN is set) | done (verified against the live local stack) |
| A8 | `make soak-report [HOURS=72]`: per-source runs/gaps > 2x interval, last errors, series gaps, row counts (for the local 72 h soak) | done |
| A7 | Deploy kit `deploy/README.md` (local-first, then exact Hetzner CX22 steps, monitoring); ADR-006 (VM vs serverless); `make backfill` runs in the container | done (docs only, nothing provisioned) |
| A9 | Versioned tile paths: `make publish` writes `lod1/v1/` and `terrain/v1/` (`TILE_VERSION`); existing objects copied server-side in R2 (556 + 88,750, headers kept); old unversioned keys left in place | done (web switches URL) |

## Phase 2: Glasgow Now (web workstream, branch `p2/web`)

| Task | Description | Status |
|---|---|---|
| B1 | `web/lib/api.ts` typed client, stale detection, fixture mode (sample data, rebased to now) | done |
| B2 | `/live`: weather, river, rainfall and air-quality cards, plain-SVG 24 h charts, stale badge, "sample data" banner; Lighthouse mobile 96 | done |
| B3 | `/explore`: bottom ticker, weather widget, status-coloured river gauges (click for 24 h chart), SEPA flood-zone toggle (Flood_Maps MapServer, OGL v3 verified, attributed on `/about/data`). OS Open Rivers and greenspace deferred: they are bulk downloads that need vector tiling | done |
| B4 | `/immersive`: river gauges as status-coloured pole markers at FLAT_GROUND_M, plus the same sample-labelled ticker | done |
| B3b | Fix: `/immersive` vehicles scaled with camera distance (min ~24 px) so they show at city scale; the dashed line at the horizon in the test frame is a pre-existing terrain-edge artefact, present with vehicles removed | done |
| B2b | Fix: follow camera views the vehicle from behind and above | done |
| B2c | Subway replay computed client-side from the deterministic sim, so the slider covers aircraft and trains (approximation of the backend sim in API mode, labelled) | done |
| B5 | vitest for `api.ts` stale logic and fixture parsing (9 tests, landed with B1); web total 22 tests | done |
| B6 | Weather (temp, wind, precip, low/mid/high cloud, stale flag) in the bottom ticker of /explore and /immersive; cloud hidden on narrow screens | done |
| B7a | Gate fix: /live air cards and ticker request and label PM2.5 when the site has it, else NO2 (`?param=`) | done |
| B7b | Gate fix: air source wording is UK-AIR (Defra) on /live, ticker tooltips and /about/data, licence pending confirmation | done |
| B7c | Gate fix: pollutant values rounded to 1 decimal on /live and the ticker | done |
| B7d | Gate fix: explicit "River data unavailable (SEPA access pending)" on /live and the ticker when there are no river stations | done |

## Phase 3: Moving City (pipeline workstream, branch `p3/pipeline`)

| Task | Description | Status |
|---|---|---|
| A0 | UK-AIR in `collectors/archive.py` (reuses `air_quality.fetch`), default in `archive.yml`, `make backfill` loads it, `docs/data-archive.md` | done |
| A1 | AOI extended to Glasgow Airport: `aoi.extra` bbox (E244000-251000, N665000-669500) unioned into the AOI via `pipelines/config.yaml` (AOI 224 to 254 km2; 2 + 3 extra LiDAR tiles). Re-ran `make lod1` + `make terrain`: 86,286 footprints (v1 81,131, +5,155), 0 dropped, default height 3.02% (v1 2.99%), 3d-tiles-validator 0 errors, 408 tiles / 96.3 MB, terrain 102,323 tiles (ground vs terrain check within 0.42 m). Published to `lod1/v2/` and `terrain/v2/` only; v1 untouched. Fix: footprints now rebuild when the AOI changes | done |
| A3 | Subway simulation: `api/subway.py` (deterministic positions from SPT timetable and `at`), `collectors/subway.py` one-off loader (Overpass `railway=subway` + NaPTAN, 15 stations), `ref.subway_track` / `ref.subway_station` (migration 003); fixture-based pytest | done (run `python -m collectors.subway` once per DB to load ref) |
| A2 | Aviation: `collectors/aircraft.py` (adsb.lol, 60 s, exponential backoff, source switch), `ts.aircraft_positions` (30-day retention), METAR QNH fallback, EGPF arrival/departure events (`ts.airport_events`), ADR-008 | done (decided by Fairuz: gentle polling) |
| A4 | API `/vehicles`, `/tracks`, `/stream/vehicles`  + `tests/test_vehicles.py` | done (aircraft and subway) |

## Phase 3: Moving City (web workstream, branch `p3/web`)

| Task | Description | Status |
|---|---|---|
| B1 | `web/lib/vehicles.ts`: typed client for `/vehicles` and `/tracks`, dead-reckoning and track interpolation, SSE hook, generated sample data in fixture mode (aircraft on the EGPF runway 23 approach, 4 subway trains), all labelled simulated | done |
| B2 | `/explore` mobility layer (`useMobility`): heading-aligned billboards coloured by mode (live/scheduled/simulated) with badge, click to follow, 24 h replay slider on the Cesium clock with `SampledPositionProperty` (aircraft only; Subway is live-only) | done (lint, tsc, build pass; browser check pending, see report) |
| B3 | `/immersive` aircraft and Subway trains as mode-coloured primitives (no CC0 glTF used; billboards/primitives per brief), dead-reckoned every frame from `lib/vehicles`, mode legend and SAMPLE DATA label | done (lint, tsc pass; browser check pending) |
| B4 | `/about/data`: adsb.lol and OSM (ODbL), NaPTAN (OGL), SPT headway, SAMPLE DATA note, mode badge explainer; bus, rail, traffic and car parks marked coming soon | done |
| B5 | vitest `lib/vehicles.test.ts` (13 tests): dead reckoning, track interpolation, timestamp units, parsing, fixture determinism, glide-slope heights, contract shape; web total 37 | done |
| B8 | Gate fix vs the real API: heading and speed are nullable (taxiing aircraft crashed Cesium with "degrees is required"): no rotation when heading is null, no dead reckoning without both; vitest added. Replay takes Subway from `/tracks?kind=subway`; the client sim is fixture-only. Verified on localhost:3000 against the live stack, 0 console errors | done |

## Phase 4: Analytical Twin (LoD2 workstream, branch `p4/lod2`)

| Task | Description | Status |
|---|---|---|
| A1 | Pilot AOI `pilot.bbox` (2 x 2 km, E258500-260500, N664500-666500) in `pipelines/config.yaml`; `python -m pipelines.lidar laz` fetches the 9 Phase 5 LAZ tiles (collection `scotland-gov/lidar/phase-5/laz`, 1 km, 4 pts/m2, same flight as the DSM/DTM, OGL v3): 361 MB, resumable, size-checked, sha256 in `data/raw/lidar/laz/SHA256SUMS` | done |
| A2 | PDAL preprocessing (`python -m pipelines.lod2 prep`, pdal 2.10.2 image pinned by digest): the Phase 5 LAZ has only classes 1 (unclassified) and 2 (ground), no roof class, so points are cropped to the footprints + 10 m, height above ground computed (`filters.hag_nn`), and unclassified points inside a footprint and >= 1.5 m above ground are set to class 6 for roofer. 722 pilot footprints (centroid in the box, within box + 25 m); 9.67 M points, 81 MB LAZ | done |
| A3 | roofer (`python -m pipelines.lod2 roofer`): official `3dgi/roofer` v1.0.0 from Docker Hub, pinned by digest (amd64 only, runs under emulation on this arm64 Mac; 722 buildings in about 6 min). Default parameters: 678 of 722 reconstructed to LoD2.2, 44 skipped (insufficient point cloud, no model). Output CityJSONSeq in EPSG:27700 with ODN heights | done (parameter grid in A5) |
| A4 | val3dity 2.7.0 (no official image or arm64 binary: built from the 2.7.0 tag, commit fbe9e4d, with the PyPI cmake; `build/tools/val3dity`). `lod2_qa.val3dity_summary` and `lod2_grid.score` read its report. Defaults (complexity 0.888): 512 of 690 solids valid (74.2%), gate 95% NOT met; `complexity_factor=0.6` gives 88.7%; see A5 grid | done |
| A5 | Parameter grid (9 runs; table in `docs/methods/lod2.md`), roofer v1.1.0-beta.1 (native arm64, pinned) chosen: 690 of 722 LoD2.2 (+10 LoD1.1 fallback, 22 skipped), val3dity 699/699 solids valid (gate 95% met), roof RMSE vs DSM per-building median 1.45 m, pixel-weighted 3.85 m (target 0.5 m NOT met: podium/tower flattening, City Chambers tower lost), LoD1 vs LoD2 and landmark tables, report `docs/methods/lod2.md` | done (RMSE gate missed, documented) |
| A6 | LoD2 tiles (`python -m pipelines.lod2_tiles cx3_beta`, pg2b3dm 2.27.0 pinned; convertwin skipped, see `docs/methods/lod2.md`): 696 buildings, 16 content tiles, 7.0 MB, largest tile 0.93 MB, 3d-tiles-validator 0 errors; ellipsoidal heights via OSGM15, LoD1 metadata fields + `lod=2`. Published to R2 `lod2/v1/` (35 objects) with `pilot_ids.json` (696 `building_id`s: web hides these LoD1 buildings); other prefixes untouched | done |

## Phase 4: Analytical Twin (analytics workstream, branch `p4/analytics`)

| Task | Description | Status |
|---|---|---|
| B1 | `pipelines/crosswalk.py`: building_id to UPRN (spatial join of OS Open UPRN, inside or nearest within 2 m) to TOID (OS Open Linked Identifiers); 87.5% of 86,286 buildings get a UPRN and a TOID; pytest on the match logic | done |
| B2 | X1 in `pipelines/attrs.py`: `volume_m3`, `storeys_est` (height / 3.0 m heuristic) and the assembler that left-joins every `part_*.parquet` onto the LoD1 base; pytest | done |
| B4 | X6 `pipelines/noise.py`: Scottish Noise Mapping Round 4 consolidated Lden, max over a 10 m footprint buffer; `noise_lden_db` and 5 dB `noise_band`; pytest on band edges | done (consolidated grid, not separate road/rail: see `docs/methods/analytics.md`) |
| B5 | `pipelines/epc.py`: Scottish domestic EPC register aggregated per building (count, median SAP, A-G band, latest year), address columns never read; `attrs.check_public_columns` guard plus pytest enforcing no address/UPRN/NGD/BHA columns; `n_uprn` renamed `n_units` so the guard can ban `uprn` | done (51.8% of buildings have an EPC; Glasgow City EPC UPRNs match the crosswalk at 99.3%) |
| B6 | `pipelines/heritage.py`: HES listed building category (A/B/C) and conservation-area flags per building; pytest | done (1,419 listed, 4,342 in conservation areas) |
| B7 | `pipelines/zones.py`: Data Zones 2022 choropleth GeoJSON (1,003 zones) with mid-2024 population, density and SIMD 2020v2 carried over by area-weighted DZ2011 to DZ2022 lookup (documented limits); `data_zone` key per building; pytest | done |
| B3 | X3 `pipelines/flood.py`: SEPA flood likelihood (high/medium/low) per building for river, coastal (MapServer) and surface water (download); `flood_max`; pytest | done (3,847 buildings high, 8,572 medium) |
| B8 | Output contract: `make analytics` -> `build/analytics/buildings_attrs.parquet` + `data_zones.geojson`, schema in `docs/methods/analytics.md`; `make tiles-attrs` rebuilds the LoD1 tiles with the new attributes (`lod1/v3/`), 3d-tiles-validator 0 errors | done |

## Phase 4: Analytical Twin (web workstream, branch `p4/web`)

| Task | Description | Status |
|---|---|---|
| C1 | Thematic switcher in `/explore` (`lib/themes.ts`, `ThemeLegend`, `?theme=`): height, EPC rating, flood, noise, heritage, each with a colourblind-safe legend (cividis, YlOrBr, magma, Okabe-Ito). One rule list drives both the Cesium 3D Tiles style and the JS classifier; tile sentinels (`none`, -1) are neutral grey and labelled no data / not mapped / not designated, never "safe". Info panel shows volume, storeys (estimate), flood, noise, EPC, listing, Data Zone with caveats (EPC domestic only, noise map not for property enquiries). Env vars documented in `web/.env.example` | done |
| C2 | LoD2 pilot (`lib/lod2.ts`): `/explore` toggle (on by default, `?lod2=0`) shows `lod2/v1` and hides the 696 `pilot_ids.json` LoD1 buildings through a Cesium style `show` regExp; LoD2 shows in the Height theme only (its tiles carry no analytics attributes, noted in the panel); info panel says LoD1 or LoD2. `/immersive` loads the same tileset and drops the pilot triangles from the LoD1 tiles (`filterIndex` on `_FEATURE_ID_0`) | done |
| C3 | Data Zone choropleth (`lib/zones.ts`, `ZoneLegend`, `?zones=1&zm=simd|density`): SIMD decile (viridis, 1 = most deprived) or population density (magma bins) as ground-clamped polygons from `analytics/v1/data_zones.geojson`; 130 zones with `simd_dominant_share` < 0.8 are hatched and fainter; legend carries the DZ2011 to DZ2022 lookup caveat; click a zone for its attributes | done |
| C4 | `/scenarios/flood` (`Explore` with `scenario="flood"`, `FloodPanel`): Flood theme and the SEPA river/coastal overlay on, camera on the Clyde through Glasgow Green, a non-operational banner and counts of LoD1 buildings by likelihood (river, coastal, surface water, highest) from the static `public/scenarios/flood_counts.json`, made by `web/scripts/flood_counts.py` from the analytics parquet. Not a forecast or warning; any footprint overlap counts, "not mapped" is not "safe" | done |
| C5 | `/about/methods` (LoD1, LoD2 with the roof RMSE miss, 1.45 m median against the 0.5 m target, and the City Chambers tower loss, analytics sources, licences and caveats, links to the docs on GitHub); `/about/data` attributions for OS Open UPRN and Linked Identifiers, SEPA flood maps v3 (incl. surface water), Noise Mapping Scotland Round 4, EPC, HES, Data Zones, SIMD, NRS and the LoD2 pilot | done |
| C6 | vitest `themes.test.ts`, `lod2.test.ts`, `zones.test.ts` (14 tests): sentinels classify as no data in every theme, Cesium conditions mirror the legend, info rows never show -1 or none as values, pilot `show` expression and `filterIndex` triangle removal, SIMD and density colours, the 0.8 hatching threshold; web total 53 | done |
| P4-fix1 | `fix(analytics)`: flood exposure needs >= 10% of the footprint in the extent (`flood_min_share`, 2 m raster + exactextract), new `flood_share_max`; `flood_max` high 3,847 to 1,198, medium 8,572 to 2,569, low 5,316 to 2,587; `web/public/scenarios/flood_counts.json` regenerated | done |
| P4-fix2 | `feat(pipeline)`: LoD2 pilot tiles carry the analytics attributes (`tiles_attrs.join_attrs`, same fields and sentinels as LoD1 plus `lod = 2` and `flood_share_max`); rebuilt `lod1/v4/` (408 tiles, 102 MB) and `lod2/v2/` (696 buildings, 16 tiles, 7.1 MB, with `pilot_ids.json`), 3d-tiles-validator 0 errors for both | done |

## Phase 5: Immersive Glasgow (branch `p5/immersive`)

| Task | Description | Status |
|---|---|---|
| 1 | Horizon artefact: the dashed far line is the end of our own terrain tileset (bounds lat 55.74 to 55.97, about 13 km north of the default camera) seen against the sky, a stepped edge because the coarse far tiles end at different heights. Fixed with a spherical cap of ground (80 km, just below sea level) under the terrain, so the edge fades into the aerial-perspective haze | done |
| 2 | Quality presets `low \| medium \| high` (`lib/quality.ts`): detect-gpu tier 3+ high, 2 medium, else low (unknown tier medium), `?q=` overrides. Each sets DPR, sun shadow map size (1024/2048/4096), clouds (off/medium/high, used from task 3) and SMAA (high only). `?hud=1` shows the preset and a live fps in a small HUD. vitest `quality.test.ts` | done |
| 3 | Volumetric clouds with `@takram/three-clouds` 0.7.6 (MIT; exact pin, depends on the installed three-atmosphere 0.19.1 and three-geospatial 0.9.1). `lib/weatherfx.ts` `cloudParams` maps `/now.weather.cloud_low/mid/high` to three decks (750 m, 2.5 km, 7.5 km): global coverage follows the cloudiest deck, sparser decks get a higher `weatherExponent`, a 0 % deck is off. Loaded with a dynamic import only in medium/high (about 145 KB of lazy JS); its textures are copied from the package to `public/clouds` at build (gitignored, 2.8 MB), only the 1 MB blue-noise texture still comes from the pinned takram GitHub commit. `?wx=low,mid,high,precip` forces weather for tests. vitest `weatherfx.test.ts` | done |
| 4 | Rain: `components/Rain.tsx`, 9,000 GPU streaks in a box that follows the camera (camera-local ENU frame, vertex-shader fall, lean from `wind_ms`), count and alpha from `rainIntensity(precip_mm)` (0 below 0.2 mm/h, saturating at 5), nothing is rendered when it is 0; wet look darkens (up to 30 %) and smooths (roughness down to 0.45) the building and terrain materials (`wetLook`). `?wx=` forces rain. vitest cases added | done |
| 5 | Clyde water plane (`components/Water.tsx`, `lib/water.ts`): polygons from OS OpenMap Local TidalWater + SurfaceWater_Area (OGL v3.0, already our footprint source), merged, simplified to 3 m, clipped to the tidal reach below Glasgow Green weir, 10 KB at `public/data/clyde_water.geojson`; attribution on `/about/data` and `DATA_LICENSES.md`. The mesh is triangulated and split to 250 m edges so it follows the Earth's curve, vertices relative to a George Square anchor. Level: nearest fresh Clyde gauge, 1:1 around a normal reading of 2.0 m within +-1.5 m, around a 53.0 m ellipsoidal surface (our terrain is flat at 52.8 m over the tidal Clyde, measured by raycast); with no usable gauge the constant 53.0 m. Scrolling ripple normal map and low roughness for sun glints (no sky reflection). vitest `water.test.ts` | done |
| 6 | Façade shader (`components/facade.ts`, `lib/facade.ts`): one `onBeforeCompile` patch on the shared building material, no textures. Listed buildings (`lb_category` A/B/C) get a sandstone tint, conservation areas a lighter one (there is no building-age attribute; listing stands in for "older"); window bands from `storeys_est` (else height / 3 m) on upper floors of walls; windows are dark by day and a hashed 45 % are lit warm at night, driven by the real sun elevation at George Square (`nightFactor`), plus a dim moonlit fill. Per-vertex data is built on tile load. Found on the way: `/immersive` never registered `GLTFExtensionsPlugin`, so tile metadata was not decoded (the LoD2 pilot hole silently did nothing); it is now registered on both building tilesets and lookups are guarded. vitest `facade.test.ts` | done |
| 7 | Camera modes (`lib/camera-modes.ts`, panel bottom-left in `/immersive`, `?mode=orbit|tour|follow`, `?follow=<id>`, `?dt=<hours>`): Orbit (GlobeControls, unchanged), Drone tour (closed loop George Square, River Clyde, SEC and Hydro, Kelvingrove, University of Glasgow; eased flight at about 60 m/s (peak about 140) between waypoints 400 m behind each landmark, 110 s loop, `?tourspeed=` scales time for capture), Follow (chase camera 300 m behind and 120 m above a vehicle from `lib/vehicles`, picker lists the live vehicles), Time-lapse (slider +-12 h shifts the scene date, so sun, night windows and atmosphere follow). vitest `camera-modes.test.ts`. Known: in headless SwiftShader at 1-2 fps the cloud temporal reprojection smears when the camera moves; static and low-quality tours render clean | done |
| 8 | Performance and fallback: the weak-GPU and phone redirect to `/explore` is now a tested pure function (`needsLightMap`, detect-gpu tier < 2 or mobile); verified headless without `?force` (SwiftShader reports tier 0): lands on `/explore?...&gpu=low` with 0 console errors. `?hud=1` (added in task 2) is the fps dev flag: preset and live fps in the top-right. Measure the Medium gate with `/immersive?q=medium&hud=1` | done |
