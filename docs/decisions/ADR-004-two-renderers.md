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

Verified with a real Cesium ion token (sample tileset, 5 hand-picked points plus 45 picked buildings in /explore):

- `/explore` uses Cesium World Terrain and ion imagery. `/immersive` loads the same terrain through
  `CesiumIonAuthPlugin` (asset 1). The `QuantizedMeshPlugin` must be registered from the ion plugin's
  `assetTypeHandler` for `TERRAIN`; registering it statically as a sibling made it parse the wrong document and
  throw. Terrain renders with a neutral material.
- Both viewers see the same terrain: at five points the three.js raycast (terrain mesh) and Cesium
  `sampleTerrainMostDetailed` agree within 0.3 m (80.5/80.5, 91.5/91.5, 78.6/78.6, 92.2/92.1, 85.7/85.4 m ellipsoidal).
- **Buildings do not sit on terrain.** `ground_z_ellip` is below the terrain by 4 to 26 m (median about 14.5 m, 43 of
  45 buildings sunk by more than 2 m) in both viewers, so footprints are partly buried. An independent DEM
  (Open-Meteo / Copernicus, orthometric) agrees with Cesium terrain to a few metres (27, 34, 28, 33 m ODN against
  Cesium minus a 54 m geoid of 26.5, 37.5, 24.6, 38 m), so the fault is in the tileset's ground heights, not in the
  renderers. This is a pipeline issue (`ground_z_odn`/`ground_z_ellip`, task 1.6/1.7), escalated rather than
  compensated for with a renderer offset.
- Without a token (flat ground at `FLAT_GROUND_M` = 60 m, Cesium via a constant `CustomHeightmapTerrainProvider`,
  three.js via a tangent disc) the fallback is unchanged and was verified before the token existed.
- GlobeControls lifted the initial camera from 380 m to 433 m ellipsoidal once terrain loaded, so the first
  frames of the two viewers differ slightly in height with terrain on.

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
