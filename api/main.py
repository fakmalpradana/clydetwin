# SPDX-License-Identifier: AGPL-3.0-or-later
"""ClydeTwin live API (Phase 2 contract: docs/phases/P2.md). Run: uvicorn api.main:app (env DATABASE_URL)."""

import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from typing import Annotated

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from psycopg.rows import dict_row

from api import subway
from collectors.common import SOURCES

app = FastAPI(title="ClydeTwin live API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,https://clydetwin.vercel.app"
    ).split(","),
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
    allow_methods=["GET"],
)


@app.exception_handler(psycopg.OperationalError)
def db_down(request, exc):
    return JSONResponse({"status": "error", "db": "down", "sources": {}}, status_code=503)


WEATHER_STATION = "meteo:r1c1"  # centre cell of the 3x3 grid, used for /now
PARAM_UNITS = {
    "temp_c": "°C",
    "wind_ms": "m/s",
    "wind_dir": "°",
    "precip_mm": "mm",
    "cloud_low": "%",
    "cloud_mid": "%",
    "cloud_high": "%",
}


def db():
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        yield conn


Conn = Annotated[psycopg.Connection, Depends(db)]


def iso(t: datetime | None) -> str | None:
    return t.astimezone(UTC).isoformat().replace("+00:00", "Z") if t else None


def latest(conn) -> dict:
    """(station_id, param) -> (t, value): newest observation up to now, within 30 days."""
    rows = conn.execute(
        """select distinct on (station_id, param) station_id, param, t, value
           from ts.observations where t > now() - interval '30 days' and t <= now()
           order by station_id, param, t desc"""
    )
    return {(r["station_id"], r["param"]): (r["t"], r["value"]) for r in rows}


def status(s: dict, lat: tuple | None, now: datetime) -> str:
    if lat is None:
        return "unknown"
    t, v = lat
    if now - t > timedelta(seconds=2 * s["interval_s"]):
        return "stale"
    if s["kind"] != "river_level":
        return "normal"
    if s["alert"] is not None and v >= s["alert"]:
        return "alert"
    if s["high"] is not None and v >= s["high"]:
        return "high"
    return "unknown" if s["high"] is None and s["alert"] is None else "normal"


def station_rows(conn) -> list[dict]:
    return conn.execute(
        "select id, source, kind, name, unit, param, interval_s, high, alert, "
        "st_x(geom) as lon, st_y(geom) as lat from ref.stations order by id"
    ).fetchall()


@app.get("/api/v1/health")
def health(conn: Conn):
    now = datetime.now(UTC)
    runs = conn.execute(
        "select source, max(finished_at) filter (where status = 'ok') as last_ok "
        "from meta.ingest_runs group by source order by source"
    ).fetchall()
    sources = {}
    for r in runs:
        age = (now - r["last_ok"]).total_seconds() if r["last_ok"] else None
        sources[r["source"]] = {
            "last_ok": iso(r["last_ok"]),
            "age_s": None if age is None else round(age),
            "stale": age is None or age > 2 * SOURCES.get(r["source"], 3600),
        }
    ok = not any(s["stale"] for s in sources.values())
    return {"status": "ok" if ok else "degraded", "db": "ok", "sources": sources}


@app.get("/api/v1/stations")
def stations(conn: Conn):
    now, lat = datetime.now(UTC), latest(conn)
    features = []
    for s in station_rows(conn):
        l_ = lat.get((s["id"], s["param"]))
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [s["lon"], s["lat"]]},
                "properties": {
                    "id": s["id"],
                    "source": s["source"],
                    "kind": s["kind"],
                    "name": s["name"],
                    "unit": s["unit"],
                    "latest": {"t": iso(l_[0]), "value": l_[1]} if l_ else None,
                    "status": status(s, l_, now),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


@app.get("/api/v1/timeseries/{station_id}")
def timeseries(
    station_id: str,
    conn: Conn,
    hours: Annotated[int, Query(ge=1)] = 24,
    param: str | None = None,
):
    """`param` (optional extension): another parameter of the station, e.g. ?param=no2 or wind_ms."""
    s = conn.execute("select param, unit from ref.stations where id = %s", (station_id,)).fetchone()
    if not s:
        raise HTTPException(404, f"unknown station {station_id}")
    param = param or s["param"]
    since = datetime.now(UTC) - timedelta(hours=min(hours, 168))
    rows = conn.execute(
        "select t, value from ts.observations where station_id = %s and param = %s and t >= %s "
        "and t <= now() order by t",
        (station_id, param, since),
    ).fetchall()
    unit = s["unit"] if param == s["param"] else PARAM_UNITS.get(param, s["unit"])
    return {"id": station_id, "unit": unit, "points": [[iso(r["t"]), r["value"]] for r in rows]}


@app.get("/api/v1/now")
def now_summary(conn: Conn):
    now, lat = datetime.now(UTC), latest(conn)
    w = {p: lat.get((WEATHER_STATION, p)) for p in ("temp_c", "wind_ms", "precip_mm")}
    w |= {p: lat.get((WEATHER_STATION, p)) for p in ("cloud_low", "cloud_mid", "cloud_high")}
    weather = {k: v[1] if v else None for k, v in w.items()}
    weather["t"] = iso(max((v[0] for v in w.values() if v), default=None))
    rivers, air = [], []
    for s in station_rows(conn):
        if s["kind"] == "river_level":
            l_ = lat.get((s["id"], s["param"]))
            rivers.append(
                {
                    "id": s["id"],
                    "name": s["name"],
                    "value": l_[1] if l_ else None,
                    "unit": s["unit"],
                    "status": status(s, l_, now),
                    "t": iso(l_[0]) if l_ else None,
                }
            )
        elif s["kind"] == "air_quality":
            pm, no2 = lat.get((s["id"], "pm25")), lat.get((s["id"], "no2"))
            air.append(
                {
                    "id": s["id"],
                    "name": s["name"],
                    "pm25": pm[1] if pm else None,
                    "no2": no2[1] if no2 else None,
                    "t": iso(max((v[0] for v in (pm, no2) if v), default=None)),
                }
            )
    return {"weather": weather, "rivers": rivers, "air": air}


# ---- Phase 3: moving city (docs/phases/P3.md). Aircraft stay empty until the adsb.lol poller (A2) exists. ----

TRACK_STEP_S = 30
MAX_WINDOW = timedelta(hours=24)
_loops: dict = {}  # static ref geometry, loaded on first use (empty until `python -m collectors.subway` ran)


def subway_loops(conn) -> dict:
    if not _loops:
        _loops.update(subway.load_loops(conn))
    return _loops


def vehicle_features(conn, kind: str | None, at: datetime) -> list[dict]:
    """Aircraft: none yet. Subway: simulated positions at `at`."""
    return subway.positions(subway_loops(conn), at) if kind in (None, "subway") else []


Kind = Annotated[str | None, Query(pattern="^(aircraft|subway)$")]


@app.get("/api/v1/vehicles")
def vehicles(conn: Conn, kind: Kind = None, at: datetime | None = None):
    """FeatureCollection of Points [lon, lat, h_ellipsoid_m]; `kind` omitted means all kinds."""
    at = at or datetime.now(UTC)
    return {"type": "FeatureCollection", "features": vehicle_features(conn, kind, at)}


@app.get("/api/v1/tracks")
def tracks(
    conn: Conn,
    kind: Annotated[str, Query(pattern="^(aircraft|subway)$")],
    from_: Annotated[datetime, Query(alias="from")],
    to: datetime,
):
    """{id: [[t, lon, lat, h], ...]} with `t` as ISO 8601 UTC. Window capped at 24 h. Subway is the simulation
    sampled every 30 s (the same function as /vehicles); aircraft tracks come from ts.aircraft_positions (A2)."""
    if not timedelta(0) < to - from_ <= MAX_WINDOW:
        raise HTTPException(422, "window must be positive and at most 24 h")
    out: dict[str, list] = {}
    if kind == "subway":
        loops = subway_loops(conn)
        t = from_
        while t <= to:
            for f in subway.positions(loops, t):
                out.setdefault(f["properties"]["id"], []).append(
                    [iso(t), *f["geometry"]["coordinates"]]
                )
            t += timedelta(seconds=TRACK_STEP_S)
    return out


@app.get("/api/v1/stream/vehicles")
async def stream_vehicles(
    request: Request, every: Annotated[float, Query(ge=0.1, le=60)] = 5, limit: int | None = None
):
    """SSE: a `vehicles` event every `every` s (5-10 s in production), both kinds in one FeatureCollection, same
    payload as /vehicles. `limit` (optional) ends the stream after that many events, for tests and curl."""

    async def gen():
        n = 0
        while not await request.is_disconnected() and (limit is None or n < limit):
            with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
                fc = {
                    "type": "FeatureCollection",
                    "features": vehicle_features(conn, None, datetime.now(UTC)),
                }
            yield f"event: vehicles\ndata: {json.dumps(fc, separators=(',', ':'))}\n\n"
            n += 1
            await asyncio.sleep(every)

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )
