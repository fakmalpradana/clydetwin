# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- `/immersive` v1 (Phase 5): quality presets `low|medium|high` (detect-gpu tier, `?q=`, `?hud=1`), volumetric clouds (`@takram/three-clouds` 0.7.6, MIT) from `/now` cloud cover, GPU rain and wet look from precipitation, Clyde water surface following the nearest gauge (OS OpenMap Local polygons, OGL), procedural sandstone façades with window bands and lit windows at night, drone tour / follow / ±12 h time-lapse camera modes, a headless capture script (`web/scripts/capture-tour.py`, with limits) and documented manual demo capture.
- Live backend (Phase 2): TimescaleDB + PostGIS schema (`ref`, `ts`, `meta`), FastAPI (`/api/v1/health|stations|timeseries|now`), collectors for Open-Meteo UKMO, UK-AIR Glasgow air quality (PM2.5, NO2) and SEPA KiWIS (off until access is granted), R2 backfill and daily dump, `docker-compose.live.yml`, `make live-up`, `make soak-report`, deploy kit (`deploy/README.md`), ADR-006 and ADR-007.

### Fixed
- `/immersive`: the dashed horizon line was the stepped far edge of our own terrain tileset against the sky; a ground cap under the terrain removes it. Tile metadata is now decoded (`GLTFExtensionsPlugin`), so the LoD2 pilot hole in LoD1 works.

### Changed
- Tiles and terrain are published under versioned R2 prefixes (`lod1/v1/`, `terrain/v1/`) so immutable caching is safe on re-uploads (`make publish`, `TILE_VERSION`).

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

[Unreleased]: https://github.com/fakmalpradana/clydetwin/compare/v0.1.0...HEAD
[0.1.1]: https://github.com/fakmalpradana/clydetwin/releases/tag/v0.1.1
[0.1.0]: https://github.com/fakmalpradana/clydetwin/releases/tag/v0.1.0
