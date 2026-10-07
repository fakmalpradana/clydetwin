# Data licences and attributions

| Part | Licence |
|---|---|
| Source code | AGPL-3.0-or-later (`LICENSE`) |
| Derived data (3D Tiles, building heights and other analytical attributes) | CC BY-SA 4.0 |
| Layers derived from OpenStreetMap / adsb.lol (later phases) | ODbL 1.0 (kept separate from OGL-derived layers) |
| Documentation, methods, blog text | CC BY 4.0 |

Inputs under the Open Government Licence v3.0 (OS OpenData, Scottish LiDAR, SEPA, HES, Scottish Government) are
compatible with CC BY-SA 4.0 derivatives, provided the attributions below are kept.

## Required upstream attributions

```
Contains OS data © Crown copyright and database right [year].
Contains public sector information licensed under the Open Government Licence v3.0.
LiDAR: Crown copyright Scottish Government, SEPA and Scottish Water (2012); Scottish Government and Fugro; Scottish Government / Bluesky.
© SEPA [year]. Contains Historic Environment Scotland data © HES.
Weather data by Open-Meteo.com (CC BY 4.0), source: UK Met Office.
Air quality: Contains public sector information licensed under the Open Government Licence v3.0, via UK-AIR (Defra) and the Scottish Air Quality Database. Licence wording to be confirmed with Defra: see ADR-007.
```

## Licensing rules for public tiles

- Public footprints come only from OS OpenMap Local; heights only from Scottish LiDAR (OGL).
- OS NGD and Digimap (EDINA) data are used for internal validation only, never published.
- Exact LiDAR phase credits are finalised in `docs/data-verification.md`.

## LiDAR actually used (Phase 1)

Scottish LiDAR Phase 5 (DSM, DTM), flown 2020-05-28 to 2021-04-12, Open Government Licence v3. Required wording
from the dataset metadata:

```
LiDAR: Crown copyright Scottish Government and Fugro (2020). Open Government Licence v3.
```

The generic LiDAR line above (SEPA / Scottish Water / Bluesky) covers other Scottish LiDAR phases and is not
needed for the published Glasgow tiles; `/about/data` should show the Phase 5 line.

## Basemaps (web viewer)

Esri Dark Gray / Light Gray canvases: Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community.
Esri World Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community. OpenStreetMap: (c) OpenStreetMap
contributors (ODbL). Google Maps (optional, with a key): official Map Tiles API only, with Google's logo and copyright.
Attribution is shown on the map for each basemap.

## Phase 4 analytics inputs (per-building attributes)

All verified on 2026-10-07 from the publisher's own page; raw downloads are cached under `data/raw/analytics/`
(gitignored). Access is anonymous HTTP for every row, no account or key.

| Dataset | Publisher | Licence | Access | Used for |
|---|---|---|---|---|
| OS Open UPRN (2026-09) | Ordnance Survey | OS OpenData licence (OGL v3 compatible), "Contains OS data (c) Crown copyright and database right 2026" | OS Downloads API, CSV 619 MB | B1 crosswalk |
| OS Open Linked Identifiers, BLPU-UPRN-TopographicArea-TOID (2026-09) | Ordnance Survey | same OS OpenData licence | OS Downloads API, CSV 841 MB | B1 crosswalk (UPRN to TOID) |
