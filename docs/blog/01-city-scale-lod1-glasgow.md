# Every building in Glasgow, extruded from public LiDAR

*Fairuz Akmal Pradana, 1 October 2026. Live demo: <https://clydetwin.vercel.app> · Code: <https://github.com/fakmalpradana/clydetwin>*

[![ClydeTwin /explore over Esri imagery, buildings coloured by height](../media/explore-esri.webp)](https://clydetwin.vercel.app/explore)

I'm studying for an MSc in Computational Geoscience at the University of Glasgow (from September 2026), so I wanted a project that would teach me the city and be useful to other people. ClydeTwin is that project: a 3D model of all 81,131 buildings in Glasgow City, built only from open data and viewable in a browser. This post covers how Phase 1 works, how I checked it, and where it is wrong.

## The problem

Open 3D city models usually stop at a few hundred buildings, or depend on a proprietary height product. Scotland, though, publishes airborne LiDAR for the whole country, and Ordnance Survey publishes building footprints. Put the two together and you can extrude every building to a measured height. The catch is that "put them together" hides a lot of small decisions: which height to take per footprint, what to do when a footprint barely overlaps its roof, and above all how to get heights and ground into the same vertical reference. That last one is where I lost the most time.

## Data

- **Heights:** Scottish LiDAR Phase 5, DSM and DTM at 50 cm, flown 28 May 2020 to 12 April 2021 for SPEN by Fugro, served from the public SRSP S3 bucket. I checked the other phases before choosing: Phase 5 covers 100% of the area of interest (Glasgow City plus 500 m, 224 km2) with a single acquisition; Phase 6 is newer but covers only 38%, and mixing phases would give inconsistent dates and seams at the datum level. The National LiDAR Programme 2025-27 returns nothing for Glasgow yet. The full download is 17 tiles, 13.4 GB.
- **Footprints:** OS OpenMap Local, `Building` layer.
- **City boundary:** OS Boundary-Line (S12000049, 176.4 km2).

Everything is under the Open Government Licence v3.

## Pipeline

**Normalised surface.** The nDSM is DSM minus DTM, floored at zero, computed block by block on VRT mosaics and written as Cloud Optimized GeoTIFFs.

**Per-footprint heights.** For each footprint I run `exactextract` (coverage-weighted) over the nDSM and keep the 50th, 70th and 90th percentiles and the maximum. The LoD1 height is the 70th percentile: it is a robust "main body" height that ignores aerials, spires and the odd tree overhang. Two edge cases:

- If p70 is under 2 m but p90 is at least 2 m, the footprint is probably a small building that only partly overlaps its own roof in the raster, so I use p90. This applied to 416 buildings (0.5%).
- If neither reaches 2 m, or there are no valid pixels, the building gets a 6 m placeholder and `height_source = default`. That is 2,424 buildings (2.99%), mostly sheds and outbuildings, or footprints that no longer match the ground. They are drawn grey in the viewer, never hidden.

**Vertical datum.** The LiDAR heights are ODN (Newlyn); 3D Tiles and CesiumJS want ellipsoidal heights. I add the OSGM15 geoid undulation (about 54 m in Glasgow) through PROJ with the OS grids. I didn't want to trust my own wiring, so the datum module is tested against the 29 official OS test vectors for GB mainland: worst error 2 mm in height and 7 mm in position. One trap here: the "Lite" developer pack is a lower-fidelity model that disagrees with the PROJ grids by about 4.5 cm, so you need the full pack to test properly.

The same care applies horizontally. I reproject footprints from EPSG:27700 to 4326 on the host with OSTN15, because the stock PostGIS image has no OS grids and falls back to a Helmert shift that is about 1 m off.

**3D Tiles.** Footprints go into PostGIS, get extruded in SQL (walls plus a flat roof, base at the ellipsoidal ground height, top at base plus height), and are tiled with pg2b3dm into 3D Tiles 1.1 with an implicit quadtree and per-building metadata in `EXT_structural_metadata`: height, `h_max`, `h_p90`, ground heights, height source and LiDAR year. The full city is 389 content tiles and 90 MB, and `3d-tiles-validator` reports 0 errors and 0 warnings. After the LiDAR download, rasters take about 8 minutes, heights 70 seconds and tiles 3 minutes.

**Terrain, and why I built my own.** My first plan was Cesium ion World Terrain as a stopgap. With a real token it sat about 14 m above the LiDAR ground in central Glasgow (anywhere from 4 to 26 m across the sample), so every building looked sunk into the hill. I spent a while suspecting my own pipeline before ruling it out: the raw DTM gives plausible numbers (11.6 m ODN at George Square, -1.2 m at the Clyde by Glasgow Bridge), and the datum step passes the OS vectors. An early cross-check against another dataset seemed to say the pipeline was wrong, but it was a 30 m surface model on a different vertical datum, so it was not independent evidence. The terrain was the odd one out.

So the pipeline now builds its own quantized-mesh terrain from the same DTM and the same geoid: resample the DTM to about 2 m, add the OSGM15 undulation, tile with `ctb-tile` up to zoom 17. Full city: 88,749 tiles, 349 MB. Buildings and ground share one DTM and one geoid, so they can't disagree vertically. I decode heights back out of the generated tiles to check: at five spread-out buildings, terrain minus `ground_z_ellip` is between -0.04 and +0.42 m.

## Two renderers, one contract

`/explore` uses CesiumJS: terrain, picking, imagery and lighting come built in, and it is the fast, shareable view. `/immersive` uses React Three Fiber with `3d-tiles-renderer` and a physically based atmosphere, which gives a proper sky and sun shadows but has no terrain or imagery of its own.

[![Immersive view at golden hour](../media/immersive.webp)](https://clydetwin.vercel.app/immersive)

Two viewers only work if they can't drift apart, so everything they must agree on lives in `web/lib/`: the tileset and attribute contract, a camera state with a query-string codec (`lon, lat, h, hd, p`), and a converter to a three.js camera in ECEF. Switching viewers just navigates with the camera in the URL. The same parameters give the same silhouette within a few pixels. Both read the same tiles and the same terrain. The reasoning is in [ADR-004](https://github.com/fakmalpradana/clydetwin/blob/main/docs/decisions/ADR-004-two-renderers.md).

A tip if you work with `3d-tiles-renderer`: register the quantized-mesh plugin from the `TilesRenderer` ref, not as a `<TilesPlugin>` child. The latter registers after the root load has started, the plugin never sees `layer.json`, and terrain stays on level 0 as one hemisphere-sized tile.

I also swapped the default basemap: Carto is gone, replaced by Esri gray canvases, with Esri imagery and OSM as options. Optional Google basemaps go through the official Map Tiles API only, and that path is implemented but untested because I have no key.

![Orbit over Glasgow](../media/orbit.webp)

## Checks

| Check | Result |
|---|---|
| Footprints in tileset | 81,131 of 81,131 (gate was 98%); 0 dropped for missing ground |
| Height (lidar + default) | median 7.2 m, p90 9.9 m, p99 18.6 m, max 70.1 m |
| Datum vs OS vectors | 29 vectors, max 2 mm height |
| Terrain vs building ground | within 0.42 m at 5 buildings |
| Buildings vs terrain in `/explore` | 186 buildings, 13 locations: median 0.3 m, 94% within 2 m, p95 2.1 m, max 6.0 m |
| Full-city load (local servers) | first buildings about 1.4 s, whole view about 1.7 s |

The load time is from local servers and a production build; over R2 and a real network it will be slower.

For landmarks I compared `h_max` (the nDSM maximum inside the footprint, so it includes spires and plant) with published heights. Different sources use different conventions, so only differences of a few metres mean anything.

| Landmark | Published (m) | `h_max` (m) | Difference | LoD1 height, h_p70 (m) |
|---|---|---|---|---|
| University of Glasgow Tower | 85 (with spire) | 85.4 | +0.4 | 22.1 |
| Glasgow City Chambers | 73 | 70.9 | -2.1 | 26.0 |
| St Andrew House | 71 (roof) | 70.6 | -0.4 | 15.2 |
| Hilton Glasgow | 70 | 72.3 | +2.3 | 16.6 |
| Livingstone Tower | about 52 (estimated) | 63.2 | +11.2 | 55.7 |

Four of five agree within 2.3 m. Livingstone Tower is off by 11 m; the published figure is itself an estimate, but the LiDAR p70 is also above it, so I can't explain it away and I haven't verified the true height independently. I left Met Tower out: the coordinates I found were about 100 m off and several 60-80 m towers sit within that radius, so matching it would have been a guess. The other matches were by distance and footprint area and weren't checked visually.

## Limitations

- **Towers on podiums are short.** The p70 height is the podium height when a footprint combines a podium and a tower. Look at the last column above: the Hilton is drawn at 16.6 m against a `h_max` of 72.3 m. `h_max` is in the metadata and the info panel shows it, but fixing the geometry needs building parts, which means LoD2 (Phase 4).
- **94% within 2 m of terrain, not 100%.** The worst case is 6 m, on the steep city centre. Roof hits are slightly offset from footprints and the terrain is a gridded DTM, so some error on slopes is expected.
- **The data is 2020-21.** New buildings and demolitions since then are missing.
- Flat roofs only; no bridges, tunnels or overhangs; heights are relative to the DTM 10th percentile under each footprint.
- **SEPA archiving is not verified.** A collector that archives Open-Meteo and SEPA river and rainfall data every 15 minutes exists, but the SEPA KiWIS side was rate-limited during testing and I haven't confirmed it works.
- Heights are estimated from public LiDAR, not survey grade. This is a research and portfolio project, not for navigation, engineering or planning.

## What's next

Phase 2, "Glasgow Now", is planned for 17 October to 15 November 2026: live weather, river levels, rainfall and air quality on top of the same city, SEPA flood zones, and a 24-hour chart. The reason the archive collector already runs is that history can't be recreated afterwards. LoD2 for podium towers comes in Phase 4.

If you spot a wrong building, or have a better published height for any of those landmarks, open an issue on the repo.

---

*Licence: CC BY 4.0. Code is AGPL-3.0-or-later; derived data is CC BY-SA 4.0. Contains OS data © Crown copyright and database right. Contains public sector information licensed under the Open Government Licence v3.0. LiDAR: Crown copyright Scottish Government and Fugro (2020).*
