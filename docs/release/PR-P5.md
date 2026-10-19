# Phase 5: Immersive Glasgow (`phase-5-immersive` to `main`)

Target release: `v0.5.0` (date TODO). Stacked on P4: merge after PR-P4.

## Summary

`/immersive` v1: effects driven by `/now` data, plus fixes to LoD2 tiles and the pilot hole.

- Quality presets low/medium/high (`?q=`, `?hud=1`), default capped at medium.
- Volumetric clouds (`@takram/three-clouds` 0.7.6) from cloud cover; GPU rain and wet look from `precip_mm`.
- Clyde water from OS OpenMap Local polygons (OGL), level from the nearest gauge, flow-map shader, planar reflection on high, depth shading and shoreline foam.
- Procedural sandstone facades, window bands, lit windows at night from the real sun.
- Camera modes: orbit, drone tour, follow a vehicle, +-12 h time-lapse.
- Fixes: dashed horizon (end of our own terrain tileset, ground cap), missing `GLTFExtensionsPlugin`, interleaved feature-id read, LoD2 triangulation in metres, LoD2 QA gate (35 of 696 rejected; `lod2/v4/`, 661 buildings).
- Infra: `timescaledb-tune` memory capped for the shared VM.

## Gate checklist

| Gate (docs/phases/P5.md) | Result |
|---|---|
| >= 50 fps on Medium on Fairuz's MacBook | PENDING. Measure with `/immersive?q=medium&hud=1`. Headless SwiftShader runs at 1-2 fps and says nothing about this |
| Fallback works, 0 console errors | Met headless: weak-GPU redirect to `/explore?...&gpu=low`, 0 console errors (task 8); `needsLightMap` is unit-tested |
| vitest covers presets and data to effect mappings | Met: `quality`, `weatherfx`, `water`, `waterfx`, `facade`, `camera-modes` tests; total count: TODO (not recorded after P4's 53) |
| README and CHANGELOG updated | Done |
| Demo clip exists | NOT YET. Capture script and manual steps are documented; a clip needs a real-GPU recording |

## Known limits

- No fps measurement and no committed demo clip yet.
- Cloud temporal reprojection smears in headless runs while the camera moves.
- Facade age is approximated by listing and conservation area; there is no building-age attribute.
- Water level is relative to a measured flat terrain at 52.8 m over the tidal Clyde; with no fresh gauge a constant 53.0 m is used.
- LoD2 quality figures (val3dity, RMSE) were not recomputed on the 661 kept buildings.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
