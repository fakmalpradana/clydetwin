# ADR-007: Air-quality source (UK-AIR SOS API)

Status: draft, accepted for implementation; one licence check outstanding (Phase 2). Licence: CC BY 4.0.

## Context

The brief asks for Scottish Air Quality Database (SAQD) Glasgow sites, with the rule: verify a documented open
access method first, otherwise stop and escalate (no scraping).

## Findings (probed 2026-10-01, three requests)

- `airquality.gov.scot` is a web UI; no documented API was found there.
- UK-AIR (Defra) exposes a documented, keyless REST API: a 52North SOS timeseries API at
  `https://uk-air.defra.gov.uk/sos-ukair/api/v1/` (`/timeseries`, `/timeseries/{id}/getData?timespan=PT12H/<end>`).
  It carries the Scottish network sites; Glasgow has Townhead, High Street, Great Western Road and Kerbside.
  PM2.5 is available at Townhead and High Street, NO2 at all four.
- Hourly values (`µg/m³`), published about 1 to 2 hours late; `timeseries/{id}/getData` returns
  `{"values":[{"timestamp":<ms>,"value":<number|null>}]}`. Coordinates in `station.geometry` are `[lat, lon]`.
- Licence: UK-AIR publishes its data under the Open Government Licence v3.0. The API's machine-readable `license`
  extra is only a placeholder (`special-licensing.lic`), so the OGL statement on the UK-AIR site is the basis.

## Decision

Use the UK-AIR SOS API (`collectors/air_quality.py`, source name `uk-air`): discover the Glasgow PM2.5/NO2
timeseries from `/timeseries` once a day, fetch the last 12 h per series every 30 minutes (overlap is harmless,
inserts are `ON CONFLICT DO NOTHING`). No scraping. Station ids are `aq:<site-slug>`; the primary parameter is
PM2.5 when the site has it, else NO2.

## Open item for Fairuz

Confirm the OGL v3 statement and the exact attribution line on the UK-AIR data-licence page before `v0.2.0`,
then replace the "to be confirmed" note in `DATA_LICENSES.md`. If Defra says otherwise, switch the collector off
(`LIVE_SOURCES`) and show no air-quality card.

## Consequences

- No API key and no account. The API has no documented rate limit; we send 5 requests per run.
- Hourly, lagged data: the station `interval_s` is 7200 s so a normal lag does not flag the site as stale.
- Sites with data gaps simply show an older latest value; the API reports `stale` honestly.
