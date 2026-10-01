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
| B5 | vitest for `api.ts` stale logic and fixture parsing (9 tests, landed with B1); web total 22 tests | done |
| B6 | Weather (temp, wind, precip, low/mid/high cloud, stale flag) in the bottom ticker of /explore and /immersive; cloud hidden on narrow screens | done |
| B7a | Gate fix: /live air cards and ticker request and label PM2.5 when the site has it, else NO2 (`?param=`) | done |
| B7b | Gate fix: air source wording is UK-AIR (Defra) on /live, ticker tooltips and /about/data, licence pending confirmation | done |
