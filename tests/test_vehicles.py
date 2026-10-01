# SPDX-License-Identifier: AGPL-3.0-or-later
"""P3 contract: /vehicles, /tracks, SSE /stream/vehicles (docs/phases/P3.md; aircraft are empty until A2)."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import LineString, Point

from api import main
from collectors import subway as ref

FX = json.loads((Path(__file__).parent / "fixtures" / "subway_ref.json").read_text())
MON_8 = datetime(2026, 10, 5, 7, 0, tzinfo=UTC)


@pytest.fixture
def client(conn, db_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setattr(main, "_loops", {})
    ref.load(
        conn,
        {c: LineString(xy) for c, xy in FX["tracks"].items()},
        [
            {"atco": s["atco"], "name": s["name"], "geom": Point(s["lon"], s["lat"])}
            for s in FX["stations"]
        ],
    )
    conn.commit()
    yield TestClient(main.app)
    conn.execute("truncate ref.subway_track, ref.subway_station")
    conn.commit()


def test_vehicles_subway_contract(client):
    r = client.get("/api/v1/vehicles", params={"kind": "subway", "at": MON_8.isoformat()})
    fc = r.json()
    assert r.status_code == 200 and fc["type"] == "FeatureCollection" and len(fc["features"]) == 12
    f = fc["features"][0]
    assert len(f["geometry"]["coordinates"]) == 3
    assert set(f["properties"]) == {"id", "kind", "label", "mode", "heading_deg", "speed_ms", "t"}
    assert f["properties"]["mode"] == "simulated" and f["properties"]["kind"] == "subway"
    assert (
        r.json()
        == client.get("/api/v1/vehicles", params={"kind": "subway", "at": MON_8.isoformat()}).json()
    )


def test_vehicles_aircraft_empty_until_poller_and_bad_kind_rejected(client):
    assert client.get("/api/v1/vehicles?kind=aircraft").json()["features"] == []
    assert client.get("/api/v1/vehicles?kind=bus").status_code == 422


def test_tracks_subway_samples_every_30s_with_iso_utc_t(client):
    to = MON_8 + timedelta(minutes=5)
    r = client.get(
        "/api/v1/tracks", params={"kind": "subway", "from": MON_8.isoformat(), "to": to.isoformat()}
    )
    tr = r.json()
    assert r.status_code == 200 and tr
    pts = next(iter(tr.values()))
    assert len(pts[0]) == 4 and pts[0][0].endswith("Z")
    t = [datetime.fromisoformat(p[0]) for p in pts]
    assert all((b - a).total_seconds() == 30 for a, b in zip(t, t[1:], strict=False))


def test_tracks_window_cap_24h(client):
    q = {
        "kind": "subway",
        "from": MON_8.isoformat(),
        "to": (MON_8 + timedelta(hours=25)).isoformat(),
    }
    assert client.get("/api/v1/tracks", params=q).status_code == 422
    q["to"] = (MON_8 - timedelta(hours=1)).isoformat()
    assert client.get("/api/v1/tracks", params=q).status_code == 422


def test_sse_vehicles_event_has_both_kinds_payload(client):
    with client.stream("GET", "/api/v1/stream/vehicles?every=0.1&limit=2") as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        body = "".join(r.iter_text())
    events = [e for e in body.split("\n\n") if e]
    assert len(events) == 2 and events[0].startswith("event: vehicles\ndata: ")
    fc = json.loads(events[0].split("data: ", 1)[1])
    assert fc["type"] == "FeatureCollection"
