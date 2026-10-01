# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/).

## [Unreleased]

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
[0.1.0]: https://github.com/fakmalpradana/clydetwin/releases/tag/v0.1.0
