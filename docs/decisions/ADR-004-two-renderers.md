# ADR-004: Two renderers (CesiumJS and three.js) over one shared contract

Status: accepted (Phase 1). Licence: CC BY 4.0.

## Context

The site needs a fast, shareable map (`/explore`) and a more cinematic view (`/immersive`). CesiumJS gives
terrain, picking, imagery and globe lighting out of the box. A three.js stack (React Three Fiber,
`3d-tiles-renderer`, `@takram/three-atmosphere`) gives physically based sky, aerial perspective and real sun
shadows, but no terrain or imagery of its own. Maintaining two viewers is only viable if they cannot drift apart.

## Decision

Keep both renderers and make everything they must agree on live in `web/lib/`:

- `tileset.ts`: the tileset URL (`NEXT_PUBLIC_TILESET_URL`), the per-building attribute contract
  (`BuildingProps`, mirrors `docs/phases/P1.md`), colour ramp and the flat-ground constant.
- `camera.ts`: `CameraState` (lon, lat, ellipsoidal height, heading, pitch; Cesium conventions) and its query-string
  codec. Pure functions, unit-tested.
- `three-camera.ts`: converts `CameraState` to and from a three.js camera in ECEF using the same WGS84 ellipsoid
  and east-north-up frame that `3d-tiles-renderer` uses to place tiles.

Geometry carries ellipsoidal heights (see the P1 contract), so neither renderer needs offsets. In `/immersive`
the world frame is ECEF, the tileset is placed by its own root `transform`, and the atmosphere library also works
in ECEF. The three.js camera uses the same horizontal frustum as Cesium's default (60 degrees across the larger
screen dimension) so the two views frame identically.

Switching viewers just navigates with the camera in the query string (`lon, lat, h, hd, p`). Other params
(`t` scene time, `force`, `gpu`) are preserved while the camera is rewritten.

## Verification (sample tileset, 179 buildings)

Same `?lon&lat&h&hd&p` in both viewers gives the same silhouette: the three tallest towers, the long block near
George Square and a small outlier building land within a few pixels of each other in 800x600 screenshots.
The conversion also round-trips in `lib/three-camera.test.ts`.

## Terrain outcome

Terrain priority, identical in both viewers: **our own quantized-mesh terrain** (`NEXT_PUBLIC_TERRAIN_URL`) over
Cesium ion World Terrain (needs `NEXT_PUBLIC_CESIUM_ION_TOKEN`) over flat ground at `FLAT_GROUND_M` (60 m; Cesium via a
constant `CustomHeightmapTerrainProvider`, three.js via a tangent disc). Outside our terrain's extent the ellipsoid is
used. ion imagery is used whenever a token exists; Carto is only the no-token basemap.

- `/explore`: `CesiumTerrainProvider.fromUrl`. `/immersive`: `QuantizedMeshPlugin` against the `layer.json` base, no
  ion auth. The plugin must be registered from the `TilesRenderer` ref. Registering it with `<TilesPlugin>` happens
  after the root load has started, so the plugin never sees `layer.json` and terrain stays at level 0 (a single
  hemisphere-sized tile). The ion path instead registers the plugin from `CesiumIonAuthPlugin`'s `assetTypeHandler`.
- Verified against the full-city tileset and terrain (`make serve-tiles MODE=aoi PORT=8082`, `make serve-terrain
  MODE=aoi`), production build, headless Chrome:
  - /explore: 186 buildings at 13 locations across the city (centre-of-view picks looking straight down): median
    |`ground_z_ellip` - terrain| 0.3 m, 94% within 2 m, 95th percentile 2.1 m, maximum 6.0 m. Per-location medians
    0.1 to 1.4 m. The worst values are in the steep city centre; roof hits are slightly offset from footprints and
    the terrain is a gridded DTM, so a few metres on slopes is expected.
  - /immersive: terrain mesh raycast at 5 buildings: -0.9, -0.2, -0.1, 0.3, 0.8 m.
  - Both viewers read the same terrain heights.
- Earlier finding, corrected (see ADR-002): ion World Terrain is about 14 m too high in central Glasgow, so buildings
  looked sunk when it was used; `ground_z_ellip` is right. The Open-Meteo/Copernicus comparison that first suggested
  otherwise was not independent evidence (a 30 m surface model on another vertical datum).
- The ion path (token, no own terrain) is kept as a fallback and still works; the flat fallback is unchanged.
- GlobeControls lifts the initial camera slightly once terrain loads, so the first frames of the two viewers can
  differ a little in height.

### Full-city loading (local servers, production build)
First buildings visible about 1.4 s after navigation, whole view loaded about 1.7 s; JS heap 34 to 48 MB (GPU memory not
measured). Production values over R2 and a real network will be slower. `/explore` on a 390x844 touch viewport loaded in
1.5 s with no console errors or horizontal overflow, and the tap-to-inspect bottom sheet works.

### Known LoD1 limitation
Towers on podiums are drawn at the 70th-percentile block height. The info panel now says so and shows `h_max`; `h_p90`
is shown only if a tile carries it (the current tiles do not). Full towers wait for LoD2.

## Basemap switcher
Esri Dark Gray (default), Esri Light Gray, Esri World Imagery and OpenStreetMap, plus Google roadmap/satellite when
`NEXT_PUBLIC_GOOGLE_MAPS_KEY` is set (hidden otherwise). Google is used only through the official Map Tiles API
(`createSession`, then `2dtiles/{z}/{x}/{y}?session&key`, copyright from the viewport endpoint); never the unofficial
`mt*.google.com/vt` URLs. The Google key path is implemented but untested (no key); the wordmark is plain text until the
official logo asset is added. The choice is `bm=` in the query string and travels with `t=` across the viewer switch.
`/explore` uses Cesium imagery layers; `/immersive` uses `ImageOverlayPlugin` + `XYZTilesOverlay`, which 3d-tiles-renderer
0.5.3 supports on quantized-mesh terrain (verified with Esri, Carto, OSM on our terrain, 60 fps headless). Where there
is no terrain (flat ground plane) the ground stays plain. Attribution is our own overlay for every basemap. OSM's public
tile server and Esri's public tile services suit a low-traffic portfolio; revisit before heavy use.

## Other choices and caveats

- Pinned: `three` 0.186.1, `3d-tiles-renderer` 0.5.3, `@takram/three-atmosphere` 0.19.1,
  `@takram/three-geospatial` 0.9.1, `postprocessing` 6.39.5, `@react-three/fiber` 9.8.1, `cesium` 1.145.0.
- `3d-tiles-renderer` needs `ImplicitTilingPlugin` registered explicitly for our implicit-quadtree tileset;
  without it the template URI is requested literally (404).
- Third-party runtime requests: atmosphere textures are generated on the GPU, and the library's blue-noise texture is
  only fetched when atmospheric shadows are enabled (we do not), so neither needs self-hosting. `detect-gpu` reads its
  benchmark tables from `/gpu-benchmarks`, copied from node_modules at build (`scripts/copy-cesium.mjs`, not
  committed). Remaining third parties: Cesium ion (terrain, imagery, with a token) and Carto raster tiles as the
  no-token fallback basemap (OSM data; fine for a non-commercial portfolio, revisit before commercial use). The ion
  free tier shows an "Upgrade for commercial use" credit.
- Scope of v0.1: no clouds, facade shaders or vehicles. Shadows cover only a 1.4 km square around George Square.
