---
title: "Streaming the environment into a 3D city: weather, rivers and air on one small VM"
author: Fairuz Akmal Pradana
status: draft
licence: CC BY 4.0
---

# Streaming the environment into a 3D city: weather, rivers and air on one small VM

*Author: Fairuz Akmal Pradana. Draft for the ClydeTwin series, post 2.*

After Phase 1, ClydeTwin was a handsome but silent model: 81,131 Glasgow buildings extruded from public LiDAR, and
nothing happening in them. Phase 2 was about making it feel like Glasgow today. That meant weather, river levels,
rainfall and air quality, stored as history, served through an API and shown in both of the viewers.

This post is about the plumbing, and about the parts that did not work out.

## The shape of the system

Three pieces:

1. **Collectors** that poll public sources on a schedule: Open-Meteo (UK Met Office model) on a 3x3 grid over the
   city, the UK-AIR network for PM2.5 and NO2, and SEPA's KiWIS service for river level and rainfall.
2. **TimescaleDB with PostGIS**, with three schemas: `ref` for stations, `ts` for the observations hypertable
   (compressed, 30-day chunks) and `meta` for an ingest log, one row per collector run.
3. **A FastAPI service** with four endpoints: `/health`, `/stations`, `/timeseries/{id}` and `/now`.

The web app (Vercel) talks to the API. The tiles and terrain stay on Cloudflare R2. The database, API, collectors and
a Caddy reverse proxy run in one Docker Compose file on a single Hetzner VM.

## Why a VM and not serverless

I wrote this down as ADR-006 because I changed my mind about it twice. The serverless version is tempting: no server
to patch, free tiers. But the Phase 1 archive job on GitHub Actions had already shown me scheduler drift and per-IP
rate limits on shared runner addresses, free tiers do not give you Timescale compression, and the data layer would
have become a second paid service anyway. A small VM with a stable IP is boring, and boring suits a time-series
workload with one maintainer. The cost is that patching and backups are mine, and that it is a single point of
failure. I accepted that because the site itself (tiles on R2) keeps working when the VM does not; the live pages just
show stale badges.

Losing the VM should not lose history either. A GitHub Actions job keeps archiving raw responses to R2 every 15
minutes, and the collectors also dump each UTC day to R2. `make backfill` loads that archive into a fresh database,
and re-running it inserts nothing new.

## Rules I set for myself

**Honest staleness.** Every station carries a latest value and a status. If the newest observation is older than
twice its expected interval, the API says `stale` and the web app shows a badge. Air quality is hourly and arrives a
couple of hours late, so those stations have a 7,200 s interval; otherwise a perfectly normal lag would look like a
fault.

**No scraping.** The brief for the air-quality source was: find a documented open API or stop. The Scottish air
quality site is a web UI without one. UK-AIR (Defra) offers a documented keyless SOS API that includes the Glasgow
sites, so that is what the collector uses (ADR-007). One caveat I have not closed: the API's machine-readable licence
field is only a placeholder. I am relying on the OGL statement on the UK-AIR website and still need to confirm the
exact attribution wording with Defra.

**Idempotent writes.** Collectors insert with `ON CONFLICT DO NOTHING`, and windows overlap on purpose, so a missed
run loses nothing and a repeated one does no harm.

**A fixture mode.** If `NEXT_PUBLIC_API_URL` is unset, the web app uses generated sample data rebased to now, and
says "sample data" on screen. That kept the web developable and previewable without a server.

## What the user sees

`/live` has cards for weather, rivers and air quality, each with a 24 h chart drawn as plain SVG. Lighthouse mobile
scored 96 on it. `/explore` gets a bottom ticker, status-coloured river gauges you can click for their 24 h chart, and
a toggle for SEPA flood zones, used straight from SEPA's own map service and attributed on the data page.
`/immersive` shows the same gauges as markers, because I wanted a rule that new data appears in both viewers.

## What did not work

**SEPA river data.** SEPA's KiWIS service returned HTTP 429 during testing, and I have not been granted access. The
collector handles 429 politely (backs off, logs, marks stale) but I can only claim it works against recorded
fixtures. Until access is granted, the UI says "River data unavailable (SEPA access pending)" instead of showing an
empty chart. I would rather show that than a blank card that looks like a bug.

**Two bugs I only found by looking.** The air cards initially showed whichever pollutant came first, so a label could
say PM2.5 above an NO2 number. The fix was to request and label the pollutant the site actually has (PM2.5 when
available, else NO2). Pollutant values also showed far too many decimals, now one.

**OS Open Rivers and greenspace layers** were on the wish list and I dropped them: they are bulk downloads that need
vector tiling, which was not cheap.

## The 72 hour soak

The gate for the phase is a 72 hour ingest with no gap longer than twice the collection interval, checked with SQL on
the VM (`make soak-report`). The stack is running on the VM now, at the time of writing since 2026-10-15, and the result
is pending. I will add the numbers when it finishes. If the report shows gaps, they go in this post too.

## What I would tell someone starting the same thing

- Write the API contract before either side starts. Both workstreams coded against the same four endpoints and that
  saved a lot of rework.
- Make "no data" a first-class state in the UI. Most of my bugs were places where a missing value looked like a
  value.
- Pick the source with a documented access method, even if it is less pretty.

Next post: making the city move.

*Text licensed CC BY 4.0. Code is AGPL-3.0-or-later. Data attributions are on the project's data page.*
