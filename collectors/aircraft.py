# SPDX-License-Identifier: AGPL-3.0-or-later
"""Aircraft around Glasgow Airport (EGPF) from adsb.lol (ODbL; ADR-008), one request per poll.

Source switch: env AIRCRAFT_SOURCE (default `adsb.lol`); add a fetcher to FETCHERS to support OpenSky later.
Heights are made ellipsoidal here: geometric altitude when sent, else barometric corrected with METAR QNH.
"""

import math
import os
import time
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel

from collectors.common import connect, get_json

EGPF = (55.8719, -4.4331)
RADIUS_NM = 22  # 40.7 km
POINT_URL = "https://api.adsb.lol/v2/point/{lat}/{lon}/{r}"
METAR_URL = "https://aviationweather.gov/api/data/metar"
FT, KT = 0.3048, 0.514444
GEOID_N_M = 54.3  # OSGM15 geoid separation at EGPF (53.9-54.6 over the +-40 km box)
FIELD_ELEV_M = 8.0  # EGPF elevation above MSL (METAR `elev`)
STD_QNH, M_PER_HPA = 1013.25, 8.23
AIRPORT_KM = (
    3.0  # within this of the field a ground/airborne transition counts as a departure/arrival
)
MIN_INTERVAL_S = 60
_qnh = {"t": 0.0, "v": None}


class Position(BaseModel):
    hex: str
    t: datetime
    lon: float
    lat: float
    h_ellip_m: float
    h_src: str
    callsign: str | None = None
    heading_deg: float | None = None
    speed_ms: float | None = None
    on_ground: bool = False


def interval_s() -> int:
    return max(MIN_INTERVAL_S, int(os.environ.get("AIRCRAFT_INTERVAL_S", MIN_INTERVAL_S)))


def qnh() -> float | None:
    """EGPF QNH in hPa from AviationWeather, cached 30 min (only fetched when a baro fallback is needed)."""
    if time.time() - _qnh["t"] > 1800:
        try:
            _qnh.update(
                t=time.time(),
                v=parse_metar(get_json(METAR_URL, {"ids": "EGPF", "format": "json"}, tries=1)),
            )
        except Exception:
            _qnh.update(t=time.time() - 1500, v=None)  # retry in 5 min
    return _qnh["v"]


def parse_metar(payload: list) -> float | None:
    return float(payload[0]["altim"]) if payload and payload[0].get("altim") else None


def ellipsoidal_height(ac: dict, qnh_hpa: float | None) -> tuple[float, str] | None:
    """(metres above the ellipsoid, source). ADS-B geometric altitude is already height above WGS84."""
    if ac.get("alt_baro") == "ground":
        return FIELD_ELEV_M + GEOID_N_M, "ground"
    if ac.get("alt_geom") is not None:
        return ac["alt_geom"] * FT, "geom"
    if isinstance(ac.get("alt_baro"), int | float):
        return ac["alt_baro"] * FT + (
            (qnh_hpa or STD_QNH) - STD_QNH
        ) * M_PER_HPA + GEOID_N_M, "baro"
    return None


def parse_adsb(payload: dict, qnh_hpa: float | None = None) -> list[Position]:
    """adsb.lol /v2/point response -> positions. `now` is epoch ms; `seen_pos` the age of the fix in seconds."""
    now = datetime.fromtimestamp(payload["now"] / 1000, UTC)
    out = []
    for ac in payload["ac"]:
        h = ellipsoidal_height(ac, qnh_hpa)
        if ac.get("lat") is None or ac.get("lon") is None or h is None:
            continue
        out.append(
            Position(
                hex=ac["hex"],
                t=now - timedelta(seconds=ac.get("seen_pos") or 0),
                lon=ac["lon"],
                lat=ac["lat"],
                h_ellip_m=h[0],
                h_src=h[1],
                callsign=(ac.get("flight") or "").strip() or None,
                heading_deg=ac.get("track"),
                speed_ms=None if ac.get("gs") is None else ac["gs"] * KT,
                on_ground=ac.get("alt_baro") == "ground",
            )
        )
    return out


def fetch_adsblol() -> list[Position]:
    payload = get_json(POINT_URL.format(lat=EGPF[0], lon=EGPF[1], r=RADIUS_NM), tries=1)
    need_qnh = any(
        a.get("alt_geom") is None and a.get("alt_baro") not in (None, "ground")
        for a in payload["ac"]
    )
    return parse_adsb(payload, qnh() if need_qnh else None)


FETCHERS = {"adsb.lol": fetch_adsblol}


def km_from_egpf(p: Position) -> float:
    dy = (p.lat - EGPF[0]) * 111.2
    dx = (p.lon - EGPF[1]) * 111.2 * math.cos(math.radians(EGPF[0]))
    return math.hypot(dx, dy)


def detect_events(prev: dict[str, Position], now: list[Position]) -> list[tuple]:
    """(t, hex, callsign, kind): touched down / lifted off within AIRPORT_KM of the field between two fixes."""
    ev = []
    for p in now:
        q = prev.get(p.hex)
        if not q or km_from_egpf(p) > AIRPORT_KM:
            continue
        if p.on_ground and not q.on_ground:
            ev.append((p.t, p.hex, p.callsign, "arrival"))
        elif q.on_ground and not p.on_ground:
            ev.append((p.t, p.hex, p.callsign, "departure"))
    return ev


def collect():
    """Scheduler hook (collectors.common.run): fetch, store, detect events. Writes its own rows, returns none."""
    positions = FETCHERS[os.environ.get("AIRCRAFT_SOURCE", "adsb.lol")]()
    with connect() as conn:
        prev = {
            r[0]: Position(
                hex=r[0], t=r[1], lon=r[2], lat=r[3], h_ellip_m=r[4], h_src="geom", on_ground=r[5]
            )
            for r in conn.execute(
                """select distinct on (hex) hex, t, lon, lat, h_ellip_m, on_ground from ts.aircraft_positions
                   where t > now() - interval '10 minutes' order by hex, t desc"""
            )
        }
        with conn.cursor() as cur:
            cur.executemany(
                """insert into ts.aircraft_positions (hex, t, lon, lat, h_ellip_m, h_src, callsign, heading_deg, speed_ms, on_ground)
                   values (%(hex)s, %(t)s, %(lon)s, %(lat)s, %(h_ellip_m)s, %(h_src)s, %(callsign)s, %(heading_deg)s,
                           %(speed_ms)s, %(on_ground)s) on conflict do nothing""",
                [p.model_dump() for p in positions],
            )
            cur.executemany(
                "insert into ts.airport_events (t, hex, callsign, kind) values (%s, %s, %s, %s) on conflict do nothing",
                detect_events(prev, positions),
            )
    return [], []
