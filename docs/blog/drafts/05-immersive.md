---
title: "Glasgow Now in the browser: clouds, rain, water and night windows driven by real data"
author: Fairuz Akmal Pradana
status: draft
licence: CC BY 4.0
---

# Glasgow Now in the browser: clouds, rain, water and night windows driven by real data

*Author: Fairuz Akmal Pradana. Draft for the ClydeTwin series, post 5.*

The last piece so far is `/immersive` v1: a view in which the sky, the rain, the river and the windows follow what is
happening in Glasgow, using the same API as the rest of the site. It is a three.js scene (via React Three Fiber) that
loads the same 3D Tiles and terrain as the explorer. This post covers how the effects connect to data, what I got
wrong on the way, and what is still unmeasured.

## Data in, effect out

I kept every mapping as a small pure function with unit tests, so that "what does 40% cloud look like" is a
tested answer and not a shader accident.

- **Clouds.** `@takram/three-clouds` (version-pinned, MIT) renders volumetric clouds in three decks at about 750 m,
  2.5 km and 7.5 km. The API's low, mid and high cloud cover set the coverage per deck; a deck at 0% is switched off.
  The package is loaded lazily, about 145 KB, and only on medium and high quality.
- **Rain.** About 9,000 GPU-animated streaks in a box that follows the camera. Count and opacity come from the
  precipitation rate: nothing below 0.2 mm/h, saturating at 5. A "wet look" darkens building and terrain materials by
  up to 30% and lowers their roughness.
- **Water.** A surface along the tidal Clyde built from OS OpenMap Local water polygons (OGL, already my footprint
  source), simplified and clipped below Glasgow Green weir. The level follows the nearest fresh river gauge, one to
  one within plus or minus 1.5 m, and falls back to a constant when no gauge has data. Since SEPA access is still
  pending, the constant is what you currently see. On medium it is a flow-map shader with Fresnel and a sun glint; on
  high it adds a planar reflection. Depth shading uses distance to the bank as a proxy, which is an approximation, not
  bathymetry.
- **Windows.** One patch on the shared building material, no textures. Window bands come from the estimated number of
  storeys, listed buildings and conservation areas get a sandstone tint (there is no building-age attribute, so
  listing stands in for "older"), and at night about 45% of windows are lit, following the real sun elevation.
- **Cameras.** Orbit, a drone tour past George Square, the Clyde, the SEC and Hydro, Kelvingrove and the University,
  follow-a-vehicle, and a plus or minus 12 hour time-lapse that moves the sun, atmosphere and night windows together.

A `?q=low|medium|high` preset controls resolution, shadow map size, clouds and anti-aliasing, defaulting from a GPU
tier detector and capped at medium. `?hud=1` shows the preset and live fps. Weak GPUs and phones are redirected to
the lighter explorer, and that is a tested function.

## Bugs that were more interesting than the features

**The dashed horizon.** A dashed line on the far horizon had been in the test frames since Phase 3. I checked
everything it could be, and it existed with every vehicle removed. It was our own terrain tileset: the data ends about
13 km north of the default camera, and its coarse far tiles end at slightly different heights, producing a stepped
edge against the sky. The fix is a very large ground cap just under sea level, so the edge fades into the haze. I
recorded the cause in the commit, because "added a plane" without a reason is not a fix anyone can trust later.

**Tile metadata was never decoded.** `/immersive` never registered the plugin that reads glTF extensions, so the LoD2
pilot's "hide the LoD1 buildings underneath" logic had silently done nothing. Nothing crashed. I only noticed because
the pilot buildings looked doubled. Registering the plugin fixed it.

**Wrong buildings hidden.** Even after that, some LoD1 buildings vanished that should not have. The feature id is
stored in an interleaved glTF buffer, and my code read the raw buffer, so it treated position and normal floats as
ids. Reading through the accessor fixed it. I verified at the exact camera that reproduced it: 507 hidden LoD1 ids, none outside the
pilot set, none of the pilot ids still shown, none drawn twice.

## What is not done

**I have not measured the frame rate target.** The gate is at least 50 fps on the medium preset on my MacBook. I have
`?q=medium&hud=1` for that and I have not done it yet. The only rendering I have run is headless, in software
(SwiftShader), at one to two frames per second, which says nothing about real hardware. In that mode the cloud
temporal reprojection also smears when the camera moves, so I cannot judge motion quality from those runs.

**There is no demo clip.** I wrote a script that renders the drone tour headlessly frame by frame, but in testing it
left tiles unloaded after a camera jump and produced a black frame, so I have not committed a clip. Manual capture steps
on a real GPU are in the README. Until a clip exists, the screenshots are the only visuals.

**Approximations to keep in mind.** Facade age comes from listing status, not a building-age dataset. The water level
reference is a measured flat terrain at 52.8 m over the tidal Clyde and a 53.0 m constant surface, which works for
the visuals and is not hydrology. The site is not operational and should not be used for flood or safety decisions.

## What I learned

1. Put every data-to-effect mapping in a testable function. It made the visuals debuggable.
2. A silent no-op is worse than a crash. Guard lookups and log when something is not what you expected.
3. Write the cause of a bug in the commit. Three of the four fixes in this phase were not what I first assumed.

The site runs at clydetwin.vercel.app. Code is AGPL-3.0-or-later, data CC BY-SA 4.0, docs CC BY 4.0.

*Text licensed CC BY 4.0.*
