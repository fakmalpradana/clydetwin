# Phase 3: Moving City (`phase-3-moving-city` to `main`)

Target release: `v0.3.0` (date TODO). Stacked on P2: merge after PR-P2.

## Summary

The city moves. Live aircraft around Glasgow Airport (adsb.lol, polled gently every 60 s, ADR-008), a deterministic
timetable-based Subway simulation, `/vehicles`, `/tracks` and an SSE stream, a mobility layer in `/explore` with a 24 h
replay slider, and aircraft and trains in `/immersive`. Every vehicle is labelled live, scheduled or simulated.

- AOI extended to Glasgow Airport: 86,286 buildings (+5,155), published as `lod1/v2/` and `terrain/v2/`; v1 untouched.
- UK-AIR added to the 15-minute R2 archive so the P2 soak can be proven from it plus `make backfill`.
- Fixes found against the real API: null heading/speed crashed Cesium; vehicles scale with camera distance in `/immersive`.

## Gate checklist

| Gate (docs/phases/P3.md) | Result |
|---|---|
| SSE stable for 1 h locally | TODO (not recorded in the repo) |
| No credentials in the bundle | TODO (not recorded in the repo); no credentialed source is used from the browser |
| Subway sim deterministic (test) | Met: `tests/test_vehicles.py`, `web/lib/vehicles.test.ts` |
| Aircraft heights plausible at landing | Fixture glide-slope heights tested; live check against the runway: TODO |
| Airport AOI tiles pass the validator | Met: 3d-tiles-validator 0 errors, 408 tiles, 96.3 MB |
| Labels correct | Met (`/about/data`, mode badges) |
| Shows in `/immersive` | Met |
| CI green, README, CHANGELOG, ADRs | README, CHANGELOG, ADR-008 done; CI link TODO |

Verified on localhost:3000 against the live local stack with 0 console errors (PROGRESS B8). Web vitest total at P3: 37.

## Known limits

- Buses (BODS), trains (Rail Data Marketplace), SCOOT traffic and car parks are not built: no accounts. Marked "coming soon".
- Subway is a simulation from the published headway, not live positions; tunnel depth not modelled (nominal 45 m).
- adsb.lol rate limits are unpublished and may require a feeder key in future (ADR-008).
- Arrival/departure events miss aircraft that lose coverage on the runway.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
