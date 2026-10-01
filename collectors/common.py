# SPDX-License-Identifier: AGPL-3.0-or-later
"""Shared collector plumbing: HTTP with backoff, validated records, idempotent upsert, run log, Healthchecks ping."""

import os
import time
from datetime import UTC, datetime
from typing import Literal

import psycopg
import requests
from pydantic import AwareDatetime, BaseModel, Field

# source -> how often the collector runs (seconds). The API flags a source stale after 2x this.
SOURCES = {"open-meteo": 1800, "uk-air": 1800, "sepa": 900}
UA = {"User-Agent": "clydetwin-collectors/0.2 (+https://github.com/fakmalpradana/clydetwin)"}


class RateLimited(Exception):
    """HTTP 429. Never retried for sources that opt out; the scheduler backs the source off."""


class Station(BaseModel):
    id: str
    source: str
    kind: Literal["river_level", "rainfall", "weather", "air_quality"]
    name: str
    unit: str
    param: str = "value"
    interval_s: int
    lon: float
    lat: float
    high: float | None = None
    alert: float | None = None


class Obs(BaseModel):
    station_id: str
    param: str = "value"
    t: AwareDatetime
    value: float = Field(allow_inf_nan=False)


def get_json(url: str, params: dict | None = None, *, tries: int = 4, retry_429: bool = True):
    """GET with exponential backoff on 5xx/network errors (and 429 unless retry_429=False)."""
    for i in range(tries):
        last = i == tries - 1
        try:
            r = requests.get(url, params=params, headers=UA, timeout=60)
        except (requests.ConnectionError, requests.Timeout):
            if last:
                raise
            time.sleep(2 * 2**i)
            continue
        if r.status_code == 429 and not retry_429:
            raise RateLimited(f"429 from {url}")
        if r.status_code in (429, 500, 502, 503, 504) and not last:
            time.sleep(2 * 2**i)
            continue
        if r.status_code == 429:
            raise RateLimited(f"429 from {url}")
        r.raise_for_status()
        return r.json()
    raise RuntimeError("unreachable")


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"])


def upsert(conn, stations: list[Station], obs: list[Obs]) -> int:
    """Stations are refreshed; observations are insert-only (ON CONFLICT DO NOTHING). Returns new rows."""
    with conn.cursor() as cur:
        cur.executemany(
            """insert into ref.stations (id, source, kind, name, unit, param, interval_s, high, alert, geom)
               values (%(id)s, %(source)s, %(kind)s, %(name)s, %(unit)s, %(param)s, %(interval_s)s,
                       %(high)s, %(alert)s, st_setsrid(st_makepoint(%(lon)s, %(lat)s), 4326))
               on conflict (id) do update set name = excluded.name, unit = excluded.unit,
                 param = excluded.param, interval_s = excluded.interval_s, geom = excluded.geom,
                 high = coalesce(excluded.high, ref.stations.high),
                 alert = coalesce(excluded.alert, ref.stations.alert)""",
            [s.model_dump() for s in stations],
        )
        cur.executemany(
            """insert into ts.observations (station_id, param, t, value)
               values (%(station_id)s, %(param)s, %(t)s, %(value)s)
               on conflict do nothing""",
            [o.model_dump() for o in obs],
        )
        return cur.rowcount


def ping(source: str, fail: bool = False) -> None:
    url = os.environ.get("HC_PING_" + source.upper().replace("-", "_"))
    if url:
        try:
            requests.get(url + ("/fail" if fail else ""), timeout=10)
        except requests.RequestException:
            pass  # monitoring must never break ingestion


def run(source: str, collect) -> str:
    """Run one collection: log it in meta.ingest_runs, return 'ok' | 'rate_limited' | 'error'."""
    with connect() as conn:
        run_id = conn.execute(
            "insert into meta.ingest_runs (source) values (%s) returning id", (source,)
        ).fetchone()[0]
        conn.commit()
        n, err = None, None
        try:
            stations, obs = collect()
            n, status = upsert(conn, stations, obs), "ok"
        except RateLimited as e:
            status, err = "rate_limited", str(e)
        except Exception as e:
            status, err = "error", f"{type(e).__name__}: {e}"
        if status != "ok":
            conn.rollback()
        conn.execute(
            "update meta.ingest_runs set finished_at = %s, status = %s, n_rows = %s, error = %s where id = %s",
            (datetime.now(UTC), status, n, err, run_id),
        )
        conn.commit()
    ping(source, fail=status != "ok")
    return status
