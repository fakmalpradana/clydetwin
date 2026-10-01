# Data verification (Phase 1, task 1.2)

Run on 2026-10-01. Everything below was verified against live endpoints; commands live in `pipelines/lidar.py`
and `pipelines/os_data.py`. Licence: all inputs are OGL v3 (OS OpenData, Scottish LiDAR).

## Verdict

**Coverage is complete and a programmatic download path exists. Recommended LiDAR source: Scottish LiDAR
Phase 5 (DSM + DTM, 50 cm, EPSG:27700, ODN heights)**, 100% of the Glasgow City + 500 m AOI with a single,
newest-available phase. National LiDAR Programme 2025-27 does **not** cover Glasgow yet (see below).

## Scottish Remote Sensing Portal (SRSP)

- The portal (`remotesensingdata.gov.scot`) is a static SPA over a public catalogue API:
  `POST https://api.remotesensing.data.gov.scot/search/product` with
  `{"collections": ["scotland-gov/lidar/phase-5/dsm"], "footprint": "<WKT EPSG:4326>", "spatialop": "intersects"}`
  (collections listed via `GET /search/collection/scotland-gov/*`; one collection per query, schemas differ).
- Each product carries a public HTTP URL in the open S3 bucket `srsp-open-data` (eu-west-2), no credentials, bucket
  listing and HTTP range requests enabled, e.g.
  `https://srsp-open-data.s3-eu-west-2.amazonaws.com/lidar/phase-5/dsm/27700/gridded/NS56NE_50CM_DSM_PHASE5.tif`.
- Tiles are 5 km x 5 km (OS grid quarter squares such as `NS56NE`), 10000 x 10000 px at 0.5 m, Float32,
  nodata -9999, LZW **Cloud Optimized GeoTIFF** (`LAYOUT=COG`). One DSM tile is about 400 MB. Because they are COGs, small
  windows can be read over HTTP without downloading the tile; the 1 km sample does this.

### Coverage of the AOI (Glasgow City boundary + 500 m, 224 km2)

| Phase | Flown | Res. | Share of AOI covered (tile union) | Note |
|---|---|---|---|---|
| **5** | 2020-05-28 .. 2021-04-12 | 50 cm | **100%** (17 tiles) | Fugro for SPEN; newest full coverage |
| 3 | 2012-14 (catalogue) / 2015-16 (abstract) | 50 cm | 100% (17 tiles) | older, inconsistent metadata dates |
| 6 | 2021-04 .. 2022-03 | 50 cm | 38% | partial, west of the city |
| 4 | 2017-2019 | 50 cm | 18% | partial |
| 1, 2 | 2011-14 | 1 m | 60% | partial, coarser |
| National LiDAR Programme 2025-27 | 2025-05 onward | | **0%** | catalogue search returns nothing for Glasgow |
| Coastal 2025-26 | 2026 | | 0% | no Glasgow tiles |

Phase 5 tiles for the AOI (identical list for DSM and DTM): NS46NE, NS55NE, NS55NW, NS56NE, NS56NW, NS56SE,
NS56SW, NS57SE, NS57SW, NS65NW, NS66NE, NS66NW, NS66SE, NS66SW, NS67SW, NS76NW, NS76SW.
Full download: DSM 6.73 GB + DTM 6.71 GB = **13.4 GB**. Phase 6 (2021-22) is newer for ~38% of the AOI but is
partial; mixing phases would produce inconsistent `lidar_year` and datum seams, so it is not used in P1.

### CRS and vertical datum

- Horizontal: EPSG:27700 (OSGB36 / British National Grid), confirmed in the GeoTIFF header.
- Vertical: the GeoTIFFs carry no vertical CRS tag. The SRSP/Spatial Data metadata record for Phase 5
  (`spatialdata.gov.scot`, record 17bdf847-6b62-497a-9389-47411a67c33f) states the data "were collected and processed
  using OSGM15 geoid model, OSTN15 horizontal transformation and **Newlyn datum**", i.e. heights are ODN
  (EPSG:5701). Sanity check: George Square DTM = 11.7 m, River Clyde bank DTM minimum 5.8 m, both plausible for ODN.
- Conversion to ETRS89 ellipsoidal height uses OSGM15 (geoid undulation about 54.1 m at George Square); see task 1.7.

### Attribution and dates

- Phase 5 attribution (per metadata): "Crown copyright Scottish Government and Fugro (2020). Open Government Licence v3".
  `DATA_LICENSES.md` / `/about/data` must name Fugro for Phase 5 (the generic plan text lists Bluesky for other phases).
- Acquisition window spans two calendar years, per-tile dates are not published. The `lidar_year` attribute is
  therefore set to **2020** (start of the window, conservative for "built after LiDAR" checks); configurable in
  `pipelines/config.yaml`. Flag for Opus: if a different convention is preferred, it is a one-line change.

### Sample tile (task 1.4+)

1 km box E 259000-260000, N 665000-666000 (George Square, Merchant City), inside tile `NS56NE`.
Read as HTTP range requests from the remote COGs (2000 x 2000 px each):

| File | Size | sha256 |
|---|---|---|
| `data/raw/lidar/sample/dsm_NS56NE.tif` | 9.5 MB | `1b70e0c4...292f` |
| `data/raw/lidar/sample/dtm_NS56NE.tif` | 10.1 MB | `3639d20d...324a` |

The complete remote tiles are 417 MB (DSM) and 424 MB (DTM). Stats: DSM 5.9..141.5 m, DTM 5.8..46.3 m ODN.

## OS OpenData

| Product | Source | Size | Notes |
|---|---|---|---|
| OS OpenMap Local, grid square NS, Shapefile | `GET https://api.os.uk/downloads/v1/products/OpenMapLocal/downloads?area=NS&format=ESRI%C2%AE+Shapefile&redirect` | 95.4 MB zip | md5 verified against the API listing; release 2026-04 |
| OS Boundary-Line GB, GML 3 | `.../products/BoundaryLine/downloads?area=GB&format=GML&subformat=3&redirect` | 167.7 MB zip | md5 verified; layer `AdministrativeUnit`, `text = 'Glasgow City'` (S12000049) |

- No API key is needed for OpenData downloads. The GB GeoPackage of Boundary-Line is 808 MB, so GML (168 MB) is used.
- Glasgow City area: 176.4 km2. AOI with 500 m buffer: 224.1 km2, bounds E 249925-270934, N 655963-673571.
- OpenMap Local `NS_Building`: 575,002 polygons for the whole NS square (EPSG:27700, polygons carry Z = 0),
  fields `ID` (UUID, unique) and `FEATCODE` (15014). The sample km has 216 buildings.
- `NS_ImportantBuilding` (6,976 features, adds `DISTNAME`, `BUILDGTHEM`, `CLASSIFICA`) duplicates geometry already
  in `NS_Building` (checked: 69/69 sample polygons are fully covered), so it is **not** loaded; it can supply names later.
- Licence file shipped: "Contains Ordnance Survey data (c) Crown copyright and database right 2026" (OS OpenData licence / OGL).

## Vertical datum grids and test vectors

- `uk_os_OSGM15_GB.tif` (1.5 MB) and `uk_os_OSTN15_NTv2_OSGBtoETRS.tif` (3.0 MB) from `cdn.proj.org`, sha256
  verified against `files.geojson`.
- OS OSTN15/OSGM15 Developer Pack (`OSTN15-OSGM15-DevelopersPack.zip`, 13 MB, from the OS "Coordinate tools and
  resources" page) provides official test points. Note: the separate *Lite* pack is a different, lower-fidelity
  model and does not match the PROJ grids (about 4.5 cm off); the full pack must be used.

## Open items

- None blocking. Phase 5 attribution wording and the `lidar_year` convention are flagged above for Opus.
