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
