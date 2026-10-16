---
title: "Making Glasgow move: live aircraft, a simulated Subway, and being honest about which is which"
author: Fairuz Akmal Pradana
status: draft
licence: CC BY 4.0
---

# Making Glasgow move: live aircraft, a simulated Subway, and being honest about which is which

*Author: Fairuz Akmal Pradana. Draft for the ClydeTwin series, post 3.*

Phase 3 was meant to be the fun one: traffic, buses, trains, planes. I got two of those, one of them real and one of
them simulated, and the rest are waiting for accounts I do not have. This post covers what I built, the labels I
put on it, and a few things that went wrong.

## Aircraft: real, but used gently

For live aircraft I used adsb.lol, which offers a keyless API and publishes its data under ODbL. I checked its terms
before building. The rate limits are not published ("dynamic based on the environment load"), and the project says an
API key may be required in future. So the collector is deliberately polite (ADR-008): one request per minute for a
22 nautical mile radius around Glasgow Airport (EGPF), a descriptive User-Agent with the repository URL, no retries
inside a poll, and exponential back-off on 429 or 5xx. About 1,440 requests a day. The source is switchable so
OpenSky can replace it when I have an account.

Heights were the fiddly part. The API contract wants ellipsoidal metres, but ADS-B reports several altitudes:

1. If the message has geometric altitude, that is already height above WGS84. Use it.
2. Otherwise barometric altitude needs a pressure correction, so I fetch the EGPF METAR QNH and apply it, plus a
   geoid separation of 54.3 m at the airport.
3. On the ground, I use the field elevation plus the same separation.

Each fix records which of the three it used. Positions go in a hypertable with a 30-day retention. Arrival and
departure events are simple: consecutive fixes of one aircraft crossing the on-ground flag within 3 km of the
airport. That misses aircraft that lose coverage on the runway; it is an indicator, not a movement log, and the docs
say so.

## The Subway: simulated, and labelled as such

There is no open live feed for the Glasgow Subway. I took the OSM `railway=subway` geometry and the 15 NaPTAN
stations, used the published headway, and wrote a deterministic simulation: given any timestamp, it returns where
each train should be on the inner and outer circles. Deterministic matters for two reasons. It lets me test it, and
it lets the 24 h replay slider work without storing anything.

The trains are drawn at a nominal height and tunnel depth is not modelled. They are not live trains and the interface
never suggests they are.

## Three badges

Every moving thing carries a mode: `live`, `scheduled` or `simulated`. The mobility layer in `/explore` shows the
badge on each vehicle, and `/immersive` has a legend. In fixture mode, the generated sample data is additionally
labelled as sample data. I think this is the single most important design decision in the phase. A moving dot on a
3D city looks authoritative whether or not it is. The badge is the cheapest defence against that.

## The API and the viewer

Three additions to the API: `/vehicles` (a GeoJSON FeatureCollection, optionally at a past time), `/tracks` for the
24 h replay, and an SSE stream that pushes a `vehicles` event every few seconds. In `/explore`, vehicles are
heading-aligned billboards, you can click one to follow it, and a slider replays the last 24 hours using the Cesium
clock. In between samples the client dead-reckons from heading and speed.

## Things that broke

**A taxiing aircraft crashed the viewer.** Heading and speed are null for aircraft on the ground, and Cesium threw
"degrees is required". I would not have found this with sample data, because my fixtures always had a heading. It only
appeared once the viewer ran against the real API. The fix: no rotation when heading is null, no dead reckoning
without both values, and tests for it. Lesson: test against the real service early, not just the fixtures.

**Vehicles disappeared at city scale.** Real-sized aircraft are a few pixels from a kilometre away, so they were
invisible. In `/immersive` they now scale with camera distance to a minimum of about 24 pixels. That is a visual
exaggeration, and I accept it because an invisible layer is worse.

**The dashed horizon.** A dashed line at the far horizon showed up in test frames. I first suspected the new vehicles,
removed them, and it was still there. It turned out to belong to the terrain, and I fixed it in Phase 5.

## Extending the map to the airport

Glasgow Airport is outside Glasgow City, so the area of interest had to grow. I added a bounding box for the airport
corridor in the pipeline config and re-ran the pipeline. The footprints went from 81,131 to 86,286 (+5,155), the
share of buildings with a default 6 m height stayed at about 3% (3.02%), the 3D Tiles validator reported 0 errors, and
the result was 408 tiles at 96.3 MB. The new tiles are published under `v2` paths; `v1` stays in place so nothing that
points at it breaks.

## What is not done

- **Buses** (Bus Open Data Service), **trains** (Rail Data Marketplace), **SCOOT traffic** and **car parks** need
  accounts I do not have yet. They are listed as "coming soon" on the data page and not built against.
- I have not recorded a one-hour SSE stability run or a live check of aircraft heights against the runway at landing.
  Heights were tested against a generated glide slope. These are the open items in the gate.

## Takeaways

Label your simulations. Poll politely and write down why. And check null cases against the real thing.

Next post: the LoD2 pilot, where the numbers are less flattering.

*Text licensed CC BY 4.0. Aircraft positions derive from adsb.lol (ODbL); OSM-derived geometry is ODbL.*
