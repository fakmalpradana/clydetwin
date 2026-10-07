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
