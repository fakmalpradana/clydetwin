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

## Phase 4: Analytical Twin (analytics workstream, branch `p4/analytics`)

| Task | Description | Status |
|---|---|---|
| B1 | `pipelines/crosswalk.py`: building_id to UPRN (spatial join of OS Open UPRN, inside or nearest within 2 m) to TOID (OS Open Linked Identifiers); 87.5% of 86,286 buildings get a UPRN and a TOID; pytest on the match logic | done |
| B2 | X1 in `pipelines/attrs.py`: `volume_m3`, `storeys_est` (height / 3.0 m heuristic) and the assembler that left-joins every `part_*.parquet` onto the LoD1 base; pytest | done |
| B4 | X6 `pipelines/noise.py`: Scottish Noise Mapping Round 4 consolidated Lden, max over a 10 m footprint buffer; `noise_lden_db` and 5 dB `noise_band`; pytest on band edges | done (consolidated grid, not separate road/rail: see `docs/methods/analytics.md`) |
| B5 | `pipelines/epc.py`: Scottish domestic EPC register aggregated per building (count, median SAP, A-G band, latest year), address columns never read; `attrs.check_public_columns` guard plus pytest enforcing no address/UPRN/NGD/BHA columns; `n_uprn` renamed `n_units` so the guard can ban `uprn` | done (51.8% of buildings have an EPC; Glasgow City EPC UPRNs match the crosswalk at 99.3%) |
