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
