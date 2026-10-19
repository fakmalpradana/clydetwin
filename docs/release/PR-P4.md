# Phase 4: Analytical Twin (`phase-4-analytical-twin` to `main`)

Target release: `v0.4.0` (date TODO). Stacked on P3: merge after PR-P3.

## Summary

A LoD2 pilot of the city centre (2 x 2 km, 722 footprints) and per-building analytics, with a thematic switcher,
Data Zone choropleth, `/scenarios/flood` and `/about/methods`.

- LoD2: Phase 5 LAZ, PDAL, roofer v1.1.0-beta.1 (pinned), val3dity, pg2b3dm; report in `docs/methods/lod2.md`.
- Analytics (`docs/methods/analytics.md`): UPRN/TOID crosswalk (87.5% of 86,286 buildings), volume and storeys estimate, SEPA flood, noise Lden, EPC (51.8% of buildings, no addresses), HES heritage (1,419 listed), Data Zones (1,003) with SIMD and population.
- Tiles with the new attributes: `lod1/v4/` (408 tiles, 102 MB) and `lod2/` pilot tiles; validator 0 errors.

## Gate checklist

| Gate (docs/phases/P4.md) | Result |
|---|---|
| val3dity >= 95% | Met: 699 of 699 solids valid (100%); defaults gave 74.2% |
| Roof RMSE < 0.5 m vs DSM | NOT MET as written. Per-building median 1.45 m (p90 4.02 m), pixel-weighted 3.85 m. The gate was redefined to the per-building median; the original target is still missed |
| No NGD/BHA/address fields in public tiles (tested) | Met: `attrs.check_public_columns` plus `tests/test_epc.py` |
| LoD2 shows in `/immersive` | Met |
| CI green, README, blog #4 drafted | README done; blog draft in `docs/blog/drafts/04-lod2-validation.md`; CI link TODO |
| NGD-based RMSE < 2 m | PENDING (no account) |

Web vitest total at P4: 53. Flood exposure now needs >= 10% of the footprint in the extent (high 3,847 to 1,198).

## Known limits

- Glasgow City Chambers tower is lost in LoD2 (33.8 m model vs about 73 m published). Towers on podiums are the main failure.
- The DSM comes from the same flight as the point cloud, so the RMSE is not an independent check.
- Noise is a strategic 10 m grid, not a property assessment; EPC covers domestic certificates only; "not mapped" is never "safe" for flood.
- Data Zone attributes use an area-weighted DZ2011 to DZ2022 lookup; 130 zones are hatched as low-confidence.
- Later P5 work rejected 35 of 696 LoD2 buildings for roofer wedges (see PR-P5).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
