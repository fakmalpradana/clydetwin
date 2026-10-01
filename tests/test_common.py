# SPDX-License-Identifier: AGPL-3.0-or-later
"""collectors/common.py: retry/backoff, 429 handling, validation, idempotent upsert, run log."""

from datetime import UTC, datetime

import pytest
import requests

from collectors import common
from collectors.common import Obs, RateLimited, Station

NOW = datetime(2026, 10, 1, 12, 30, tzinfo=UTC)


class FakeResponse:
    def __init__(self, status, body=None):
        self.status_code, self.body = status, body

    def json(self):
        return self.body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


@pytest.fixture
def fake_get(monkeypatch):
    calls = []

    def install(*responses):
        it = iter(responses)

        def get(url, **kw):
            calls.append(url)
            r = next(it)
            if isinstance(r, Exception):
                raise r
            return r

        monkeypatch.setattr(common.requests, "get", get)
        monkeypatch.setattr(common.time, "sleep", lambda s: None)
        return calls

    return install


def test_get_json_retries_5xx_and_connection_errors(fake_get):
    calls = fake_get(requests.ConnectionError(), FakeResponse(503), FakeResponse(200, {"ok": 1}))
    assert common.get_json("http://x") == {"ok": 1}
    assert len(calls) == 3


def test_get_json_429_without_retry_is_not_hammered(fake_get):
    calls = fake_get(FakeResponse(429), FakeResponse(200, {}))
    with pytest.raises(RateLimited):
        common.get_json("http://x", retry_429=False)
    assert len(calls) == 1


def test_get_json_gives_up_after_tries(fake_get):
    calls = fake_get(*[FakeResponse(500)] * 4)
    with pytest.raises(requests.HTTPError):
        common.get_json("http://x", tries=4)
    assert len(calls) == 4


def seed():
    st = [
        Station(id="t:1", source="open-meteo", kind="weather", name="A", unit="°C", param="temp_c",
                interval_s=3600, lon=-4.2, lat=55.8),
    ]  # fmt: skip
    ob = [Obs(station_id="t:1", param="temp_c", t=NOW, value=1.5)]
    return st, ob


def test_upsert_is_idempotent(conn):
    st, ob = seed()
    assert common.upsert(conn, st, ob) == 1
    assert common.upsert(conn, st, ob) == 0  # same rows again: nothing new
    ob2 = [Obs(station_id="t:1", param="temp_c", t=NOW, value=99.0)]
    assert common.upsert(conn, st, ob2) == 0  # DO NOTHING, not overwrite
    assert conn.execute("select count(*), max(value) from ts.observations").fetchone() == (1, 1.5)
    assert conn.execute("select count(*) from ref.stations").fetchone() == (1,)


def test_obs_rejects_nan():
    with pytest.raises(ValueError):
        Obs(station_id="a", t=NOW, value=float("nan"))
    with pytest.raises(ValueError):
        Obs(station_id="a", t="2026-10-01T10:00:00", value=1.0)  # naive time


def test_run_logs_ok_error_and_rate_limit(conn, db_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db_url)

    def boom():
        raise RuntimeError("nope")

    def limited():
        raise RateLimited("429")

    assert common.run("open-meteo", seed) == "ok"
    assert common.run("open-meteo", boom) == "error"
    assert common.run("sepa", limited) == "rate_limited"
    conn.commit()  # new snapshot
    rows = conn.execute(
        "select source, status, n_rows, error from meta.ingest_runs order by id"
    ).fetchall()
    assert rows == [
        ("open-meteo", "ok", 1, None),
        ("open-meteo", "error", None, "RuntimeError: nope"),
        ("sepa", "rate_limited", None, "429"),
    ]
