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
