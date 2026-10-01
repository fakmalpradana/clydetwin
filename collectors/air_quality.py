# SPDX-License-Identifier: AGPL-3.0-or-later
"""Glasgow air quality (PM2.5, NO2) from the UK-AIR SOS REST API (Defra / Scottish Air Quality Database sites).

Open, documented, keyless 52North timeseries API: https://uk-air.defra.gov.uk/sos-ukair/api/v1/ (ADR-007).
Hourly values, published with a lag of one to two hours.
"""

import re
import time
from datetime import UTC, datetime

from collectors.common import Obs, Station, get_json

SOURCE = "uk-air"
API = "https://uk-air.defra.gov.uk/sos-ukair/api/v1"
POLLUTANTS = {"6001": "pm25", "8": "no2"}  # EIONET pollutant vocabulary ids
UNITS = {"ug.m-3": "µg/m³"}
_cache: dict = {"t": 0.0, "series": []}


def discover(items: list[dict]) -> list[dict]:
    """Glasgow PM2.5 / NO2 timeseries from the (large) timeseries listing."""
    out = []
    for ts in items:
        m = re.search(r"pollutant/(\d+) ", ts["label"])
        label = ts["station"]["properties"]["label"]
        if not m or m[1] not in POLLUTANTS or not label.startswith("Glasgow"):
            continue
        lat, lon = ts["station"]["geometry"]["coordinates"][:2]  # this API lists [lat, lon]
        site = label.rsplit("-", 1)[0]
        out.append(
            {
                "ts_id": ts["id"],
                "site": site,
                "param": POLLUTANTS[m[1]],
                "unit": UNITS.get(ts["uom"], ts["uom"]),
                "lat": lat,
                "lon": lon,
            }
        )
    return out


def series() -> list[dict]:
    if time.time() - _cache["t"] > 86400:
        _cache.update(
            t=time.time(), series=discover(get_json(f"{API}/timeseries", {"limit": 5000}))
        )
    return _cache["series"]


def station_id(site: str) -> str:
    return "aq:" + re.sub(r"[^a-z0-9]+", "-", site.lower()).strip("-")


def stations_from(found: list[dict]) -> list[Station]:
    out = {}
    for s in sorted(
        found, key=lambda s: s["param"] != "pm25"
    ):  # pm25 first: it is the primary param
        out.setdefault(
            s["site"],
            Station(
                id=station_id(s["site"]),
                source=SOURCE,
                kind="air_quality",
                name=s["site"],
                unit=s["unit"],
                param=s["param"],
                interval_s=7200,  # hourly data arrives 1-2 h late
                lon=s["lon"],
                lat=s["lat"],
            ),
        )
    return list(out.values())


def parse(payload: dict, s: dict) -> list[Obs]:
    return [
        Obs(
            station_id=station_id(s["site"]),
            param=s["param"],
            t=datetime.fromtimestamp(v["timestamp"] / 1000, UTC),
            value=v["value"],
        )
        for v in payload["values"]
        if v["value"] is not None
    ]


def collect(hours: int = 12):
    found = series()
    end = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    obs = []
    for s in found:
        payload = get_json(
            f"{API}/timeseries/{s['ts_id']}/getData", {"timespan": f"PT{hours}H/{end}"}
        )
        obs += parse(payload, s)
    return stations_from(found), obs
