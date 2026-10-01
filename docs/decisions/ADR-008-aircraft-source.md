# ADR-008: Aircraft source (adsb.lol), polling and heights

Status: accepted (2026-10-01, decided by Fairuz). Phase 3.

## Context
Phase 3 needs live aircraft around Glasgow Airport (EGPF), keyless and free. OpenSky needs an account that does not
exist yet. adsb.lol offers a keyless REST API (`/v2/point/{lat}/{lon}/{radius_nm}`).

## Terms (checked 2026-10-01)
- Data licence **ODbL 1.0** ("available to everyone"). Attribution is required and the layer is kept separate
  (own table `ts.aircraft_positions`, own label on `/about/data`), never merged into other datasets.
- Rate limits are **not published**: "Rate limits are dynamic based on the environment load" (adsb.lol API repo).
  4xx means misuse. The repo also says an **API key, obtained by feeding adsb.lol, will be required in future**.
- Data is "as is", accuracy not guaranteed (privacy/licence page).

## Decision
Use it gently:
- One request per poll, a 22 nm (40.7 km) radius around EGPF, every **60 s** (`AIRCRAFT_INTERVAL_S`, minimum 60).
- Descriptive User-Agent with the repo URL (`collectors.common.UA`).
- No retries inside a poll. On 429 or 5xx the source skips 2, 4, 8 ... intervals (max 32), then recovers on the first success.
- The source is switchable (`AIRCRAFT_SOURCE`, `collectors.aircraft.FETCHERS`) so OpenSky can replace or augment it.
- If a key becomes mandatory: feed adsb.lol or switch source. Nothing else changes.

## Heights
The API contract wants ellipsoidal metres. In order:
1. `alt_geom` (ADS-B geometric altitude) is already height above WGS84: use it as is (`h_src = geom`).
2. Else barometric altitude (feet) corrected with the EGPF METAR QNH (AviationWeather, one request per 30 min, only when
   needed): `alt_baro*0.3048 + (QNH - 1013.25) * 8.23 m/hPa + N`, where N = 54.3 m is the OSGM15 geoid separation at EGPF
   (53.9 to 54.6 over the box) (`h_src = baro`). Without a METAR, standard pressure is assumed.
3. On the ground: field elevation 8 m + N (`h_src = ground`).

## Events
Arrival and departure are `ts.airport_events` rows made when consecutive fixes of one aircraft cross the ground flag
within 3 km of EGPF. Aircraft that lose coverage on the runway are missed; this is a simple indicator, not a movement log.

## Consequences
30-day retention (Timescale policy). About 1,440 requests a day. Observed 2026-10-01: 4 aircraft in range.
