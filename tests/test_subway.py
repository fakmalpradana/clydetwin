# SPDX-License-Identifier: AGPL-3.0-or-later
import json
from datetime import UTC, datetime
from pathlib import Path

from shapely.geometry import LineString, Point

from api import subway
from collectors import subway as ref

FX = json.loads((Path(__file__).parent / "fixtures" / "subway_ref.json").read_text())
GOVAN = next((s["lon"], s["lat"]) for s in FX["stations"] if s["name"] == "Govan")
LOOPS = {c: subway.Loop(xy, GOVAN) for c, xy in FX["tracks"].items()}
MON_8 = datetime(2026, 10, 5, 7, 0, tzinfo=UTC)  # 08:00 BST on a Monday: peak


def test_fixture_is_fifteen_stations_and_two_closed_loops():
    assert len(FX["stations"]) == 15
    assert all(xy[0] == xy[-1] for xy in FX["tracks"].values())
    assert 10_000 < LOOPS["inner"].length < 11_000


def test_deterministic():
    assert subway.positions(LOOPS, MON_8) == subway.positions(LOOPS, MON_8)
    assert subway.positions(LOOPS, MON_8.replace(tzinfo=None)) == subway.positions(LOOPS, MON_8)


def test_peak_headway_gives_six_trains_per_circle_and_all_simulated():
    feats = subway.positions(LOOPS, MON_8)
    assert len(feats) == 12
    assert {f["properties"]["mode"] for f in feats} == {"simulated"}
    assert len({f["properties"]["id"] for f in feats}) == 12
    assert all(len(f["geometry"]["coordinates"]) == 3 for f in feats)


def test_no_service_at_night_and_trains_stay_on_the_track():
    assert subway.positions(LOOPS, datetime(2026, 10, 5, 2, 0, tzinfo=UTC)) == []
    for f in subway.positions(LOOPS, MON_8):
        lon, lat, _ = f["geometry"]["coordinates"]
        loop = LOOPS["outer" if "outer" in f["properties"]["id"] else "inner"]
        d = loop.line.distance(Point(lon * loop.kx, lat * subway.M_LAT))
        assert d < 1


def test_train_starts_at_govan_and_moves_with_the_circuit_speed():
    at = datetime(2026, 10, 5, 5, 30, tzinfo=UTC)  # 06:30 BST: first departure
    f = subway.positions(LOOPS, at)
    assert len(f) == 2
    lon, lat, _ = f[0]["geometry"]["coordinates"]
    assert abs(lon - GOVAN[0]) < 1e-3 and abs(lat - GOVAN[1]) < 1e-3
    assert 6 < f[0]["properties"]["speed_ms"] < 8


def test_sunday_service_window_and_wrong_outer_direction():
    assert subway.positions(LOOPS, datetime(2026, 10, 4, 7, 0, tzinfo=UTC)) == []  # Sun 08:00
    assert len(subway.positions(LOOPS, datetime(2026, 10, 4, 12, 0, tzinfo=UTC))) > 0
    outer = LineString(FX["tracks"]["outer"])
    assert ref.signed_area(outer) < 0  # outer circle runs clockwise


def test_ref_roundtrip(conn):
    tracks = {c: LineString(xy) for c, xy in FX["tracks"].items()}
    stations = [
        {"atco": s["atco"], "name": s["name"], "geom": Point(s["lon"], s["lat"])}
        for s in FX["stations"]
    ]
    ref.load(conn, tracks, stations)
    ref.load(conn, tracks, stations)  # idempotent
    loops = subway.load_loops(conn)
    conn.execute("truncate ref.subway_track, ref.subway_station")
    conn.commit()
    assert set(loops) == {"inner", "outer"}
    assert subway.positions(loops, MON_8) == subway.positions(LOOPS, MON_8)
