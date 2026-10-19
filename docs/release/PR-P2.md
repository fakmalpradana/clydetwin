# Phase 2: Glasgow Now (`phase-2-glasgow-now` to `main`)

Target release: `v0.2.0` (date TODO). Merge first; P3 to P5 are stacked on this branch.

## Summary

Adds live environmental conditions to the 3D city: a TimescaleDB-backed API on one VM, collectors for weather, air
quality and (when access exists) SEPA, a `/live` page, a ticker, river gauges and SEPA flood zones in both viewers.
Also introduces versioned R2 prefixes (`lod1/v1/`, `terrain/v1/`) so immutable caching is safe.

- Backend: `db/migrations`, `api/` (health, stations, timeseries, now), `collectors/` (Open-Meteo UKMO, UK-AIR, SEPA off by default), R2 backfill and daily dump, `docker-compose.live.yml`, `deploy/`.
- Web: typed API client with stale detection and fixture mode, `/live`, ticker, gauges, flood-zone toggle.
- Decisions: ADR-006 (one VM, not serverless), ADR-007 (UK-AIR as air-quality source).

## Gate checklist

| Gate (docs/phases/P2.md) | Result |
|---|---|
| 72 h ingest, no gap > 2x interval | PASSED WITH CONDITIONS (VM, 2026-10-15 20:30 to 2026-10-19 22:00 UTC). Open-Meteo 143/143 ok, max gap 31 min (limit 60). UK-AIR: Defra SOS API returned 504 to every client (VM and a home connection) from 2026-10-17 06:18 for 2.6 days; external outage, collector retries every 30 min. adsb.lol: 2,321/2,473 ok, then a 13.7 h stall from 429s on the VM's IPv4; fixed by fetching over IPv6 (98c0885). The first soak-report missed running outages; fixed in 3e0b277. VM RAM 1.2/3.7 GB (32%) with the co-hosted NARAGA stack. Accepted by Fairuz 2026-10-20. |
| pytest and vitest green, CI green | pytest against seeded TimescaleDB; web vitest 22 tests at the end of P2 (docs/PROGRESS.md B5). CI link: TODO |
| gitleaks clean, no secret in the web bundle | gitleaks runs in pre-commit; bundle grep result: TODO (not recorded in the repo) |
| VM idle RAM under 60% | TODO (not recorded in the repo) |
| `/live` Lighthouse mobile >= 80 | Met: 96 (PROGRESS B2) |
| Gauges in `/explore` and `/immersive` | Met (B3, B4) |
| README, CHANGELOG, ADR-006, ADR-007 | Done |
| Release `v0.2.0` | Not tagged yet |

## Known limits

- SEPA KiWIS access is not granted; collector verified by fixtures only. The UI says "River data unavailable (SEPA access pending)".
- ADR-007 open item: confirm the OGL wording for UK-AIR with Defra.
- OS Open Rivers and greenspace layers deferred (bulk downloads that need vector tiling).
- Single VM, single point of failure (ADR-006); the site still works and `/live` shows stale badges.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
