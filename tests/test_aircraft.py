# SPDX-License-Identifier: AGPL-3.0-or-later
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from collectors import aircraft

FX = Path(__file__).parent / "fixtures"
ADSB = json.loads((FX / "adsb_point.json").read_text())
METAR = json.loads((FX / "metar_egpf.json").read_text())


def test_parse_metar_qnh():
    assert aircraft.parse_metar(METAR) == 1020.0 and aircraft.parse_metar([]) is None


def test_parse_adsb_recorded_response():
    pos = aircraft.parse_adsb(ADSB, 1020.0)
    assert len(pos) == ADSB["total"] == 4
    p = next(p for p in pos if p.hex == "406c72")  # EZY653E on approach, alt_geom 975 ft
    assert p.callsign == "EZY653E" and p.h_src == "geom"
    assert p.h_ellip_m == pytest.approx(975 * 0.3048)
    assert p.speed_ms == pytest.approx(130.9 * 0.514444) and p.heading_deg == 226.55
    assert p.t <= datetime.fromtimestamp(ADSB["now"] / 1000, UTC)


def test_altitude_conversion():
    f = aircraft.ellipsoidal_height
    assert f({"alt_geom": 1000, "alt_baro": 800}, 1020) == (pytest.approx(304.8), "geom")
    # baro only: pressure altitude 1000 ft, QNH 1023.25 hPa (+10 hPa = +82.3 m), plus geoid separation
    h, src = f({"alt_baro": 1000}, 1023.25)
    assert src == "baro" and h == pytest.approx(304.8 + 82.3 + 54.3)
    assert f({"alt_baro": 1000}, None)[0] == pytest.approx(304.8 + 54.3)  # standard pressure
    assert f({"alt_baro": "ground"}, None) == (8.0 + 54.3, "ground")
    assert f({}, None) is None


def test_skips_aircraft_without_position_or_altitude():
    payload = {
        "now": 1790883213500,
        "ac": [{"hex": "a", "alt_geom": 100}, {"hex": "b", "lat": 55.9, "lon": -4.4}],
    }
    assert aircraft.parse_adsb(payload) == []


def pos(hex_, lat, lon, ground):
    return aircraft.Position(
        hex=hex_,
        t=datetime.now(UTC),
        lon=lon,
        lat=lat,
        h_ellip_m=60,
        h_src="geom",
        on_ground=ground,
    )


def test_arrival_departure_events():
    on_field = (55.872, -4.433)
    prev = {
        "a": pos("a", *on_field, False),
        "d": pos("d", *on_field, True),
        "far": pos("far", 56.5, -4.4, False),
    }
    now = [
        pos("a", *on_field, True),
        pos("d", *on_field, False),
        pos("far", 56.5, -4.4, True),
        pos("new", *on_field, True),
    ]
    kinds = {(e[1], e[3]) for e in aircraft.detect_events(prev, now)}
    assert kinds == {
        ("a", "arrival"),
        ("d", "departure"),
    }  # far from the field and unseen-before are ignored


def test_interval_is_never_below_60s(monkeypatch):
    monkeypatch.setenv("AIRCRAFT_INTERVAL_S", "10")
    assert aircraft.interval_s() == 60
    monkeypatch.setenv("AIRCRAFT_INTERVAL_S", "120")
    assert aircraft.interval_s() == 120


def test_collect_stores_positions_and_events(conn, db_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setitem(aircraft.FETCHERS, "adsb.lol", lambda: aircraft.parse_adsb(ADSB, 1020.0))
    aircraft.collect()
    aircraft.collect()  # same fixes again: idempotent
    assert conn.execute("select count(*) from ts.aircraft_positions").fetchone() == (4,)
    conn.execute("truncate ts.aircraft_positions, ts.airport_events")
    conn.commit()
