# SPDX-License-Identifier: AGPL-3.0-or-later
"""API contract (docs/phases/P2.md) against a seeded TimescaleDB."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from api.main import app
from collectors.common import Obs, Station, upsert

NOW = datetime.now(UTC).replace(microsecond=0)


def st(id, kind, name, unit, param="value", interval=900, lon=-4.25, lat=55.86, **kw):
    src = {"river_level": "sepa", "rainfall": "sepa", "weather": "open-meteo"}.get(kind, "uk-air")
    return Station(id=id, source=src, kind=kind, name=name, unit=unit, param=param,
                   interval_s=interval, lon=lon, lat=lat, **kw)  # fmt: skip


def series(station, param, values, step_min=15, end=NOW):
    n = len(values)
    return [
        Obs(
            station_id=station,
            param=param,
            t=end - timedelta(minutes=step_min * (n - 1 - i)),
            value=v,
        )
        for i, v in enumerate(values)
    ]


@pytest.fixture
def client(conn, db_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db_url)
    stations = [
        st("sepa:1", "river_level", "Kelvin", "m", high=1.0, alert=2.0),
        st("sepa:2", "river_level", "Clyde high", "m", high=1.0, alert=2.0),
        st("sepa:3", "river_level", "Clyde alert", "m", high=1.0, alert=2.0),
        st("sepa:4", "river_level", "No thresholds", "m"),
        st("sepa:5", "river_level", "Old gauge", "m", high=1.0),
        st("sepa:6", "river_level", "Silent gauge", "m", high=1.0),
        st("sepa:7", "rainfall", "Rain", "mm"),
        st("meteo:r1c1", "weather", "centre", "°C", param="temp_c", interval=3600),
        st("aq:glasgow-high-street", "air_quality", "Glasgow High Street", "µg/m³", param="pm25", interval=7200),
        st("aq:glasgow-kerbside", "air_quality", "Glasgow Kerbside", "µg/m³", param="no2", interval=7200),
    ]  # fmt: skip
    obs = (
        series("sepa:1", "value", [0.4, 0.5, 0.6])
        + series("sepa:2", "value", [1.4])
        + series("sepa:3", "value", [2.5])
        + series("sepa:4", "value", [0.9])
        + series("sepa:5", "value", [0.1], end=NOW - timedelta(hours=1))  # > 2 x 15 min
        + series("sepa:7", "value", [0.0, 0.2])
        + series("meteo:r1c1", "temp_c", [11.0, 12.0], step_min=60)
        + series("meteo:r1c1", "wind_ms", [3.0, 4.5], step_min=60)
        + series("meteo:r1c1", "precip_mm", [0.0, 0.1], step_min=60)
        + series("meteo:r1c1", "cloud_low", [10, 20], step_min=60)
        + series("meteo:r1c1", "cloud_mid", [30, 40], step_min=60)
        + series("meteo:r1c1", "cloud_high", [50, 60], step_min=60)
        + series("aq:glasgow-high-street", "pm25", [5.0, 6.5], step_min=60)
        + series("aq:glasgow-high-street", "no2", [20.0], step_min=60)
        + series("aq:glasgow-kerbside", "no2", [31.0], step_min=60)
        + [Obs(station_id="sepa:1", t=NOW + timedelta(hours=2), value=9.9)]  # future: never served
        + series("sepa:1", "value", [0.3], end=NOW - timedelta(hours=200))  # outside the 168 h cap
    )
    upsert(conn, stations, obs)
    conn.execute(
        "insert into meta.ingest_runs (source, finished_at, status) values "
        "('open-meteo', %s, 'ok'), ('uk-air', %s, 'ok'), ('sepa', %s, 'rate_limited')",
        (NOW - timedelta(minutes=5), NOW - timedelta(hours=3), NOW),
    )
    conn.commit()
    return TestClient(app)


def props(client):
    fc = client.get("/api/v1/stations").json()
    return {f["properties"]["id"]: f for f in fc["features"]}


def test_stations_geojson(client):
    r = client.get("/api/v1/stations")
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 10
    f = props(client)["sepa:1"]
    assert f["geometry"] == {"type": "Point", "coordinates": [-4.25, 55.86]}
    p = f["properties"]
    assert set(p) == {"id", "source", "kind", "name", "unit", "latest", "status"}
    assert p["kind"] == "river_level" and p["source"] == "sepa" and p["unit"] == "m"
    assert p["latest"]["value"] == 0.6  # newest, the future 9.9 is ignored
    assert p["latest"]["t"] == NOW.isoformat().replace("+00:00", "Z")


def test_station_status(client):
    s = {k: v["properties"]["status"] for k, v in props(client).items()}
    assert s["sepa:1"] == "normal"
    assert s["sepa:2"] == "high"
    assert s["sepa:3"] == "alert"
    assert s["sepa:4"] == "unknown"  # no thresholds known
    assert s["sepa:5"] == "stale"
    assert s["sepa:6"] == "unknown"  # never observed
    assert props(client)["sepa:6"]["properties"]["latest"] is None
    assert s["meteo:r1c1"] == "normal" and s["aq:glasgow-high-street"] == "normal"


def test_timeseries(client):
    r = client.get("/api/v1/timeseries/sepa:1")
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == "sepa:1" and d["unit"] == "m"
    assert [p[1] for p in d["points"]] == [0.4, 0.5, 0.6]
    assert d["points"][0][0] < d["points"][-1][0]  # ascending ISO UTC
    assert d["points"][-1][0].endswith("Z")
    assert client.get("/api/v1/timeseries/sepa:1?hours=1").json()["points"][0][1] == 0.4
    # hours is capped at 168: the observation 200 h old is never returned
    assert [p[1] for p in client.get("/api/v1/timeseries/sepa:1?hours=9999").json()["points"]] == [
        0.4, 0.5, 0.6
    ]  # fmt: skip
    wind = client.get("/api/v1/timeseries/meteo:r1c1?param=wind_ms").json()
    assert wind["unit"] == "m/s" and [p[1] for p in wind["points"]] == [3.0, 4.5]
    no2 = client.get("/api/v1/timeseries/aq:glasgow-high-street?param=no2").json()
    assert no2["unit"] == "µg/m³" and len(no2["points"]) == 1
    assert client.get("/api/v1/timeseries/sepa:6").json()["points"] == []


def test_timeseries_unknown_station_404(client):
    assert client.get("/api/v1/timeseries/nope:1").status_code == 404
    assert client.get("/api/v1/timeseries/sepa:1?hours=0").status_code == 422


def test_now_summary(client):
    d = client.get("/api/v1/now").json()
    assert set(d) == {"weather", "rivers", "air"}
    assert d["weather"] == {
        "temp_c": 12.0, "wind_ms": 4.5, "precip_mm": 0.1,
        "cloud_low": 20.0, "cloud_mid": 40.0, "cloud_high": 60.0,
        "t": (NOW).isoformat().replace("+00:00", "Z"),
    }  # fmt: skip
    rivers = {r["id"]: r for r in d["rivers"]}
    assert (
        len(rivers) == 6
        and rivers["sepa:3"]["status"] == "alert"
        and rivers["sepa:3"]["value"] == 2.5
    )
    assert set(rivers["sepa:1"]) == {"id", "name", "value", "unit", "status", "t"}
    assert rivers["sepa:6"]["value"] is None
    air = {a["id"]: a for a in d["air"]}
    assert (
        air["aq:glasgow-high-street"]["pm25"] == 6.5
        and air["aq:glasgow-high-street"]["no2"] == 20.0
    )
    assert air["aq:glasgow-kerbside"]["pm25"] is None and air["aq:glasgow-kerbside"]["no2"] == 31.0


def test_now_summary_empty_db(conn, db_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db_url)
    d = TestClient(app).get("/api/v1/now").json()
    assert d["weather"]["temp_c"] is None and d["weather"]["t"] is None
    assert d["rivers"] == [] and d["air"] == []


def test_health(client):
    d = client.get("/api/v1/health").json()
    assert d["db"] == "ok" and d["status"] == "degraded"
    s = d["sources"]
    assert (
        s["open-meteo"]["stale"] is False and 295 <= s["open-meteo"]["age_s"] < 600
    )  # seeded 5 min ago; suite runtime adds a little
    assert s["uk-air"]["stale"] is True  # 3 h > 2 x 30 min
    assert s["sepa"] == {"last_ok": None, "age_s": None, "stale": True}  # only rate_limited runs


def test_health_db_down(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://x:x@127.0.0.1:1/x?connect_timeout=1")
    r = TestClient(app).get("/api/v1/health")
    assert r.status_code == 503 and r.json()["db"] == "down"


def test_cors(client):
    def allowed(origin):
        r = client.get("/api/v1/now", headers={"Origin": origin})
        return r.headers.get("access-control-allow-origin")

    assert allowed("http://localhost:3000") == "http://localhost:3000"
    assert allowed("https://clydetwin.vercel.app") == "https://clydetwin.vercel.app"
    assert allowed("https://clydetwin-git-p2-web-x.vercel.app")  # preview
    assert allowed("https://evil.example.com") is None
