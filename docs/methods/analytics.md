# Per-building analytics: method and output contract

Licence: CC BY 4.0. Code: `pipelines/`. Inputs and licences: `DATA_LICENSES.md`. The building universe is the LoD1
`heights.gpkg` (86,286 footprints, OS OpenMap Local) so every attribute is keyed on `building_id`.

## B1. Join keys: `building_id` - UPRN - TOID

OpenMap Local has no TOID, so the crosswalk is spatial (`pipelines/crosswalk.py`):

1. OS Open UPRN points (British National Grid) inside the AOI bounding box (773,988 UPRNs).
2. Each UPRN goes to the footprint that contains it; a UPRN outside every footprint snaps to the nearest footprint
   within 2 m; farther ones stay unmatched. Overlapping footprints: nearest, then smaller area.
3. OS Open Linked Identifiers (BLPU-UPRN-TopographicArea-TOID) gives the TOID of each UPRN. A building's `toid` is
   the most common TOID among its UPRNs; `n_toid` counts the distinct ones.

Result (OS release 2026-09): 489,726 UPRNs matched (63.3% of the bounding-box UPRNs; the rest are outside the AOI
polygon or are not inside a building: gardens, car parks, pitches, street furniture), 97.7% of those inside the
footprint and the rest within 2 m; 100% of matched UPRNs have a TOID. 75,482 of 86,286 buildings (87.5%) have at least
one UPRN and a TOID. Limits: the relation is many-to-many. A footprint that merges several terraced houses
carries several TOIDs (50,534 buildings have `n_toid` > 1), and the TOID is a MasterMap Topography area, not a
footprint-for-footprint match. Buildings without a UPRN (outbuildings, sheds) get null `toid`.

## B2. X1 volume and storeys

`volume_m3 = area_m2 * height` (footprint area times the LoD1 height `h_p70`, so it is a LoD1 prism volume: it ignores
roof shape and underestimates podium-and-tower buildings, see `lod1.md`). `storeys_est = max(1, round(height / 3.0))`:
a heuristic with a fixed 3.0 m floor-to-floor height (`analytics.storey_height_m`); it overestimates tall-storey
commercial buildings and underestimates low-ceiling flats. Buildings with `height_source = "default"` (3%) have the 6 m
default height, so their storeys (2) and volume are placeholders.

## B4. X6 noise exposure

Source: Noise Mapping Scotland Round 4 (2021), consolidated Lden grid (road, rail, Glasgow Airport and industry
combined by logarithmic summation; 10 m cells, receiver height 4 m, OGL v3). The brief asked for road and rail; the
consolidated grid is used because it is the only Lden product published as one GeoTIFF for all sources (the per-source
layers exist only as MapServer services). `pipelines/noise.py` takes the **maximum over each footprint buffered by
10 m** (`exactextract`, coverage weighted), a proxy for the loudest facade.

| Field | Type | Domain |
|---|---|---|
| `noise_lden_db` | float32 | 1 decimal, dB(A) Lden; null where the grid has no value (56 buildings outside the model) |
| `noise_band` | string | `<50`, `50-54`, `55-59`, `60-64`, `65-69`, `70-74`, `75+`; null with `noise_lden_db` |

Limits: strategic modelling at 10 m is not a property-level assessment (the publisher says so); the 10 m buffer
picks up the road in front of a building in narrow streets; a building's quiet facade is not represented.
Result: median 55.9 dB, 75+ dB for 713 buildings, 70+ dB for 3,345.

## B5. EPC (domestic)

Source: the Scottish EPC Register open dataset (domestic certificates, Q2 2016 to Q2 2026, 40 quarterly CSVs). The
open file has no non-domestic certificates, so non-domestic buildings carry no EPC. The `OSG_REFERENCE_NUMBER`
column is the UPRN (Glasgow City certificates matched to the crosswalk: 165,769 of 166,885 UPRNs, 99.3%, which also
confirms that the column is the OS UPRN).

`pipelines/epc.py` reads **only** the UPRN, lodgement date, SAP score and local authority columns: address columns are
never loaded. The newest certificate per UPRN is kept, UPRNs are mapped to buildings through the crosswalk, and the
UPRN is dropped. `attrs.check_public_columns` fails the build, and `tests/test_epc.py` fails CI, if any column name
contains address, postcode, uprn, osg_, ngd or bha.

| Field | Type | Domain |
|---|---|---|
| `epc_count` | int32 | number of dwellings with a current certificate in the building; 0 when none |
| `epc_sap_median` | float | median SAP energy efficiency score (1-100) of those certificates; null when `epc_count` is 0 |
| `epc_rating` | string | SAP band of the median score: A (92+), B (81-91), C (69-80), D (55-68), E (39-54), F (21-38), G (1-20); null when none |
| `epc_latest_year` | int16 | year of the newest certificate; null when none |

Coverage: 44,711 of 86,286 buildings (51.8%) have at least one certificate; rating counts C 24,459, D 13,672,
B 3,710, E 2,081, A 476, F 260, G 53. Limits: certificates exist only for dwellings that were sold, let or
retrofitted since 2016; a building's rating is the median over its certified flats, so it describes the certified
part. For a building with one certificate, the rating is that dwelling's rating (no address is published).

## B6. HES heritage

Listed Buildings entry points and Conservation Areas polygons from the HES download service (the data.gov.uk
record shows the licence field as "not set", but the HES portal terms state that spatial downloads are OGL v3; the
HES attribution wording is in `DATA_LICENSES.md`). `pipelines/heritage.py`:

- `lb_category` / `listed`: the highest category (A > B > C) among entry points inside the footprint or within 5 m of
  it (HES points are accurate to 1-10 m). Names and addresses of listed buildings are not read.
- `conservation_area`: the footprint's representative point lies inside a conservation area polygon.

| Field | Type | Domain |
|---|---|---|
| `lb_category` | string | `A`, `B`, `C`, `none` |
| `listed` | bool | `lb_category != "none"` |
| `conservation_area` | bool | |

Result: 1,419 listed buildings (A 258, B 917, C 244) from 5,584 entry points in the AOI box, and 4,342 buildings in
52 conservation areas. Limits: many entries are not buildings in OpenMap Local (bridges, walls, monuments) and
are not matched; a listing covers a whole building and its curtilage but only the building the point falls on is
flagged; the conservation area dataset is compiled by HES from local authorities and "may not contain the most recent
data".

## B7. Data Zones 2022, SIMD, population

Output `build/analytics/data_zones.geojson` (EPSG:4326, 1,003 Data Zones 2022 that hold at least one building,
2.8 MB) is choropleth-ready; `data_zone` (the `dz22` code) is also a per-building field (100% of buildings keyed by
their representative point).

| Field | Type | Domain |
|---|---|---|
| `dz22` | string | Data Zone 2022 code, `S01...` |
| `name` | string | zone name |
| `pop_2024` | int | NRS mid-2024 population, persons (381 to 4,324) |
| `area_km2` | float | standard (coastline-clipped) area |
| `pop_density_km2` | int | `pop_2024 / area_km2` (24 to 66,527) |
| `simd_rank` | int | SIMD 2020v2 overall rank, 1 = most deprived, 6,976 = least (carried over, see below) |
| `simd_decile` | int | 1 (most deprived 10%) to 10; zone counts 246, 140, 109, 91, 70, 55, 71, 76, 81, 64 |
| `simd_dominant_share` | float | 0 to 1: share of the zone covered by its largest 2011 zone |

**DZ2011 to DZ2022 lookup and its limits.** SIMD 2020v2 uses the 2011 Data Zones; NRS and the Scottish Government
state that no official lookup to the 2022 zones exists. We build our own: each 2022 zone takes the area-weighted mean
SIMD rank of the 2011 zones it overlaps (EPSG:27700 intersection areas, slivers under 1 m2 ignored), and the decile is
recomputed from that rank. Limits: (1) it is geometric, not population-weighted, so a split zone whose people live
in one half is misattributed; (2) averaging ranks of very different zones yields a value that no real zone has;
(3) 130 of the 1,003 zones (13%) have `simd_dominant_share` below 0.8, i.e. they were split or merged by the 2022
review, so treat their SIMD value as approximate (the web should flag them); (4) the new zones reflect the 2022
Census while SIMD indicators are 2011-2019 vintage. A SIMD release on the 2022 zones would replace this lookup.

## B3. X3 flood exposure

SEPA Flood Maps v3.0 (OGL v3). River and coastal extents come from the open Flood_Maps MapServer (3 likelihood layers each,
queried once per layer for the AOI envelope, 6 requests in all, cached under `data/raw/analytics/flood/`); surface water
and small watercourses use SEPA's published file geodatabase (the MapServer would have needed about 320 paged queries
for 320k polygons), clipped to the AOI with `ogr2ogr`. A building gets, per source, the highest likelihood whose extent
intersects its footprint: `high` (about 1 in 10 years), `medium` (1 in 200), `low` (1 in 1000), else `none`.

| Field | Type | Domain |
|---|---|---|
| `flood_river`, `flood_coastal`, `flood_surface` | string | `none`, `low`, `medium`, `high` |
| `flood_max` | string | the worst of the three |

Result (86,286 buildings): `flood_max` none 68,551, low 5,316, medium 8,572, high 3,847; river high 978, coastal high
178, surface high 2,899. Limits: any intersection counts, however small (no depth or area threshold, so edge touching
flags a building); the maps show present-day, undefended-by-design extents and not climate scenarios; depth is not
included (the depth layers are tens of GB). SEPA states that the maps are strategic and not for individual property
assessment.

## B8. Output contract

`make analytics` writes `build/analytics/buildings_attrs.parquet` (one row per `building_id`, 86,286 rows, the
LoD1 universe) and `build/analytics/data_zones.geojson`. Parquet uses real nulls; `building_id` joins to the LoD1 tiles.
`crosswalk.parquet` holds UPRNs and is internal, never published. Public columns are checked by
`attrs.check_public_columns` (no address, postcode, UPRN, OS NGD or Digimap BHA names).

| Column | Type | Domain |
|---|---|---|
| `building_id` | string | OpenMap Local id, parts of multipolygons suffixed `-n` |
| `area_m2`, `height` | float | LoD1 footprint area and height (m) |
| `height_source` | string | `lidar`, `default` |
| `volume_m3` | float | area x height |
| `storeys_est` | int16 | >= 1 |
| `n_units`, `n_toid` | int32 | UPRNs matched / distinct TOIDs, 0 when none |
| `toid` | string | most common TOID, null when none |
| `epc_count` | int32 | 0 when none |
| `epc_sap_median` | float | 1-100, null when none |
| `epc_rating` | string | A-G, null when none |
| `epc_latest_year` | float | null when none |
| `flood_river`, `flood_coastal`, `flood_surface`, `flood_max` | string | none, low, medium, high |
| `noise_lden_db` | float32 | dB, null when outside the model |
| `noise_band` | string | `<50`, `50-54`, `55-59`, `60-64`, `65-69`, `70-74`, `75+`, null |
| `lb_category` | string | A, B, C, none |
| `listed`, `conservation_area` | bool | |
| `data_zone` | string | DZ2022 code, joins to `data_zones.geojson` `dz22` |

**LoD1 tiles v3** (`make tiles-attrs`, `lod1/v3/`, new version, v1 and v2 untouched). Metadata is the v2 set plus
`volume_m3`, `storeys_est`, `flood_river`, `flood_coastal`, `flood_surface`, `flood_max`, `noise_lden_db`, `noise_band`,
`epc_count`, `epc_sap_median`, `epc_rating`, `lb_category`, `conservation_area` (int 0/1) and `data_zone`. Tile properties
have no nulls: text without a value is `"none"`, numbers without a value are `-1` (`noise_lden_db`, `epc_sap_median`),
`epc_count` is 0. UPRN, TOID, addresses and every NGD or BHA field are not in the tiles.
