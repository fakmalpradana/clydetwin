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

- With a Cesium ion token, `/explore` uses Cesium World Terrain. `/immersive` is wired to try
  `CesiumIonAuthPlugin` (asset 1) plus `QuantizedMeshPlugin` from 3d-tiles-renderer 0.5.3, with a neutral
  material. **This path is untested**: no token existed when it was written. If it misbehaves, delete the `hasIon`
  branch in `components/ImmersiveScene.tsx` and the ground plane takes over.
- Without a token (the only case verified), both viewers use a flat ground at `FLAT_GROUND_M` (60 m ellipsoidal,
  roughly the lowest building base in the sample): Cesium via a constant `CustomHeightmapTerrainProvider`,
  three.js via a tangent disc. Buildings then sit on a flat map; real relief arrives with ion terrain here and own
  DTM terrain in Phase 2.

## Other choices and caveats

- Pinned: `three` 0.186.1, `3d-tiles-renderer` 0.5.3, `@takram/three-atmosphere` 0.19.1,
  `@takram/three-geospatial` 0.9.1, `postprocessing` 6.39.5, `@react-three/fiber` 9.8.1, `cesium` 1.145.0.
- `3d-tiles-renderer` needs `ImplicitTilingPlugin` registered explicitly for our implicit-quadtree tileset;
  without it the template URI is requested literally (404).
- Atmosphere precomputed textures are generated on the GPU at load; the blue-noise (STBN) texture is fetched from
  the library's GitHub media URL. `detect-gpu` fetches its benchmark table from unpkg. Self-host both if the
  third-party requests matter.
- Basemap is Carto dark raster tiles (OSM data), fine for a non-commercial portfolio; revisit before commercial use.
- Scope of v0.1: no clouds, facade shaders or vehicles. Shadows cover only a 1.4 km square around George Square.
