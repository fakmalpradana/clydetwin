# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/).

## [Unreleased]

Nothing yet.

## [0.5.0] - Unreleased (release date TODO)

Phase 5, "Immersive Glasgow". Web-side effects driven by `/now` data, plus LoD2 tile fixes.

### Added
- `/immersive` quality presets `low|medium|high` (detect-gpu tier, `?q=`), `?hud=1` shows the preset and a live fps.
- Volumetric clouds (`@takram/three-clouds` 0.7.6, MIT) from `/now` low/mid/high cloud cover; rain and a wet look from `precip_mm`.
- Clyde water surface from OS OpenMap Local polygons (OGL v3.0), level following the nearest Clyde gauge. Flow-map shader with Fresnel, sky and sun glint (medium), planar reflection (high), depth shading with translucent shallows and a shoreline foam band.
- Procedural sandstone facades for listed buildings and conservation areas, window bands from `storeys_est`, lit windows at night from the real sun position.
- Camera modes: orbit, drone tour (George Square, Clyde, SEC and Hydro, Kelvingrove, University), follow a vehicle, +-12 h time-lapse.
- Headless drone-tour capture script (`web/scripts/capture-tour.py`, limits in its header) and documented manual demo capture.
- LoD2 QA gate (`lod2.qa` in `pipelines/config.yaml`): buildings with roofer plane-extrapolation wedges fall back to LoD1.

### Fixed
- The dashed horizon line was the stepped far edge of our own terrain tileset; a ground cap under the terrain removes it.
- `/immersive` never registered `GLTFExtensionsPlugin`, so tile metadata was not decoded and the LoD2 pilot hole did nothing.
- LoD1 pilot hole: interleaved `_feature_id_0` was read as a raw buffer, hiding the wrong triangles; now read through `getX`.
- LoD2 faces are triangulated in metres before the datum step (robustness; the visible spikes were roofer wedges, fixed by the QA gate).
- Timescale `timescaledb-tune` memory capped for the shared 4 GB VM.

### Changed
- LoD2 pilot tiles: `lod2/v4/` (661 buildings, 16 tiles, 3d-tiles-validator 0 errors); 35 of 696 rejected by the QA gate.
- Default quality is capped at medium.

### Known limitations
- Medium preset >= 50 fps on a MacBook is the gate and has not been measured yet (TODO).
- No demo clip is committed; it needs a recording on a real GPU.
- Headless SwiftShader renders at 1-2 fps; cloud reprojection smears while the camera moves there.

## [0.4.0] - Unreleased (release date TODO)

Phase 4, "Analytical Twin".

### Added
- LoD2 pilot (City Centre / Merchant City, 2 x 2 km, 722 footprints): Phase 5 LAZ download, PDAL preprocessing, roofer LoD2.2 (v1.1.0-beta.1, pinned), val3dity scoring, 3D Tiles published under `lod2/`. Validation in `docs/methods/lod2.md`.
- Per-building analytics: `building_id` to UPRN to TOID crosswalk, volume and storeys estimate, SEPA flood likelihood, Scottish Noise Mapping Round 4 Lden, domestic EPC aggregate, HES listed and conservation flags, Data Zones 2022 with SIMD and population. Contract in `docs/methods/analytics.md`, published in `lod1/v3/` then `lod1/v4/` tiles.
- `/explore` thematic switcher (height, EPC, flood, noise, heritage) with colourblind-safe legends, Data Zone choropleth, LoD2 pilot toggle.
- `/scenarios/flood` (non-operational exposure counts) and `/about/methods`.
- Tests that fail the build if any public column looks like an address, UPRN, NGD or BHA field.

### Changed
- Flood exposure requires >= 10% of the footprint inside the SEPA extent (`flood_max` high 3,847 to 1,198).
- LoD2 pilot tiles carry the analytics attributes.

### Known limitations
- Roof RMSE vs DSM target 0.5 m not met: per-building median 1.45 m (pixel-weighted 3.85 m). The target was redefined to the per-building median.
- Glasgow City Chambers tower is lost in LoD2 (33.8 m vs about 73 m published).
- val3dity gate (95%) met: 699 of 699 solids valid.
- OS NGD / Digimap BHA validation (RMSE < 2 m) pending an account.

## [0.3.0] - Unreleased (release date TODO)

Phase 3, "Moving City".

### Added
- Live aircraft around Glasgow Airport from adsb.lol (ODbL, 60 s polling, ADR-008) with ellipsoidal heights and arrival/departure events.
- Simulated Glasgow Subway from OSM geometry and NaPTAN stations, deterministic for any time.
- API `/vehicles`, `/tracks` and the SSE `/stream/vehicles`.
- `/explore` mobility layer with live/scheduled/simulated badges, click-to-follow and a 24 h replay slider; aircraft and trains in `/immersive`.
- AOI extended to Glasgow Airport: 86,286 buildings (+5,155), published as `lod1/v2/` and `terrain/v2/`.
- UK-AIR added to the 15-minute R2 archive.

### Fixed
- Null heading or speed (taxiing aircraft) crashed Cesium; vehicles scale with camera distance in `/immersive`.

### Known limitations
- Buses, trains, SCOOT traffic and car parks are not built (accounts pending); marked coming soon.
- The Subway is a timetable simulation, not live positions.

## [0.2.0] - Unreleased (release date TODO)

Phase 2, "Glasgow Now".

### Added
- Live backend: TimescaleDB + PostGIS (`ref`, `ts`, `meta`), FastAPI (`/api/v1/health|stations|timeseries|now`), collectors for Open-Meteo UKMO, UK-AIR Glasgow air quality and SEPA KiWIS (off until access is granted), R2 backfill and daily dump, `docker-compose.live.yml`, `make live-up`, `make soak-report`, deploy kit (`deploy/README.md`), ADR-006 and ADR-007.
- `/live` page with weather, river, rainfall and air-quality cards, 24 h charts and stale badges; fixture mode so the web builds without the API.
- `/explore` and `/immersive`: bottom ticker, weather, river gauges coloured by status, SEPA flood-zone toggle.

### Changed
- Tiles and terrain are published under versioned R2 prefixes (`lod1/v1/`, `terrain/v1/`) so immutable caching is safe (`make publish`, `TILE_VERSION`).

### Known limitations
- 72 h ingest soak on the VM is still running (since 2026-10-15).
- SEPA KiWIS is untested live (access pending); the UI says river data is unavailable.
- Air-quality OGL wording still to be confirmed with Defra (ADR-007).

## [0.1.1] - 2026-10-01

### Fixed
- `/immersive`: sun shadows now follow the camera and scale with the view, so every visible building casts a shadow (previously a fixed ±700 m box around George Square).

## [0.1.0] - 2026-10-01 — "Glasgow in 3D"

### Added
- LoD1 3D Tiles 1.1 of all of Glasgow City (81,131 buildings) from OS OpenMap Local footprints and Scottish LiDAR Phase 5 (50 cm), with per-building metadata (`height`, `h_max`, `h_p90`, ground heights, source, LiDAR year).
- Own quantized-mesh terrain from the LiDAR DTM, ODN converted to ellipsoidal heights with OSGM15 (checked against 29 official OS test vectors).
- Reproducible pipeline: `make lod1`, `make tiles`, `make terrain`, `make publish`.
- Web app: landing page, `/explore` (CesiumJS), `/immersive` v0.1 (three.js + 3d-tiles-renderer + physical atmosphere), `/about/data`; shared camera URLs and a basemap switcher (Esri Dark/Light Gray, Esri World Imagery, OSM; Google via the official Map Tiles API when a key is set).
- Archive collector for Open-Meteo UKMO and SEPA river level/rainfall to R2 every 15 minutes.
- Licences (AGPL-3.0 code, CC BY-SA 4.0 data, CC BY 4.0 docs), ADRs 001–005, methods and QA report.

### Known limitations
- LoD1 block height is the 70th percentile, so towers on podiums look short (LoD2 in Phase 4).
- 94% of sampled buildings sit within 2 m of terrain; up to 6 m on steep city-centre slopes.
- SEPA KiWIS archiving not yet verified (rate-limited during testing).

[Unreleased]: https://github.com/fakmalpradana/clydetwin/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/fakmalpradana/clydetwin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/fakmalpradana/clydetwin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/fakmalpradana/clydetwin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/fakmalpradana/clydetwin/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/fakmalpradana/clydetwin/releases/tag/v0.1.1
[0.1.0]: https://github.com/fakmalpradana/clydetwin/releases/tag/v0.1.0
