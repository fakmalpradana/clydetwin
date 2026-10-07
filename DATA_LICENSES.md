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
- The `/immersive` Clyde water surface (`web/public/data/clyde_water.geojson`, 10 KB) is derived from OS OpenMap Local TidalWater and SurfaceWater_Area polygons (OGL v3.0, simplified to 3 m); the OS attribution line above applies.
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
| Noise Mapping Scotland Round 4, Consolidated (all sources) Lden, 2021 | Scottish Government | OGL v3. Attribution: "(c) Scottish Government, contains Ordnance Survey data (c) Crown copyright and database right 2025". Strategic mapping, not for property enquiries | Direct download `map.sepa.org.uk/atom/noise/Noise_Consolidated_LDEN.zip` (GeoTIFF, 10 m, 852 MB) | B4 noise |
| Domestic Energy Performance Certificates, dataset to Q2 2026 (Scottish EPC Register, 7z of quarterly CSVs, 190 MB) | Scottish Government | OGL v3 for all non-address fields; ADDRESS1, ADDRESS2, POSTTOWN and POSTCODE are Royal Mail licensed and are never read | `data.gov.scot` resource download, anonymous | B5 EPC |
| Listed Buildings (points) and Conservation Areas (polygons), HES download service | Historic Environment Scotland | OGL v3 (HES portal terms: spatial downloads are under the Open Government Licence). Attribution: "Contains Historic Environment Scotland and OS data (c) Historic Environment Scotland and Crown Copyright and database right (year), licensed under the Open Government Licence v3.0" | `inspire.hes.scot/AtomService/DATA/lb_scotland.zip` (6.5 MB) and `ca_scotland.zip` (2.3 MB), anonymous | B6 heritage |
| Data Zone Boundaries 2011 and 2022 | Scottish Government | OGL v3, "Contains National Records of Scotland and OS data" per the boundary metadata; attribute as Scottish Government | `maps.gov.scot/ATOM/shapefiles/SG_DataZoneBdry_{2011,2022}.zip` (19 MB, 26 MB) | B7 |
| SIMD 2020v2 (ranks by 2011 Data Zone) | Scottish Government via opendata.nhs.scot | OGL v3 (`uk-ogl` on the CKAN record) | CSV download, 525 KB | B7 |
| Small area population estimates mid-2011 to mid-2024, 2022 Data Zones | National Records of Scotland | OGL v3 (Crown copyright, stated on the NRS publication page) | NRS publication zip (100 MB, xlsx per year) | B7 population |
| SEPA Flood Maps v3.0: river and coastal extents (high/medium/low likelihood) and surface water and small watercourses extents | SEPA | OGL v3, "(c) SEPA 2025" (MapServer copyright text, SEPA data page) | River and coastal: `map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer` layers 0-2 and 6-8, 6 queries of one AOI envelope (cached). Surface water: SEPA download `SEPA_Surface_Water_Flood_Maps_EXTENT_v3_0.zip` (1.94 GB, one request) | B3 flood |

## Third-party assets

- `web/public/water/Water_1_M_Normal.jpg`, `Water_2_M_Normal.jpg`: water normal maps from the three.js examples (`examples/textures/water`, release r186),
  Copyright 2010-2026 three.js authors, MIT licence. Copied into the repo; nothing is fetched from GitHub at run time.
- `web/public/clouds/*` (build-time copy, gitignored): textures of `@takram/three-clouds`, MIT.
