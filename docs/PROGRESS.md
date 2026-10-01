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
