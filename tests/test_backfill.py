# SPDX-License-Identifier: AGPL-3.0-or-later
import gzip
import json
from datetime import date

from collectors import backfill, dump

REC = {
    "lat": 55.8,
    "lon": -4.3,
    "time": "2026-10-01T10:00",
    "temperature_2m": 12.0,
    "precipitation": None,
    "cloud_cover_low": 1,
    "cloud_cover_mid": 2,
    "cloud_cover_high": 3,
    "wind_speed_10m": 36.0,
    "wind_direction_10m": 90,
    "fetched_at": "2026-10-01T10:15:00+00:00",
}


def test_om_obs_converts_wind_and_drops_forecast_hours():
    from collectors.archive import grid_points

    lat, lon = grid_points()[4]
    recs = [
        REC | {"lat": lat, "lon": lon},
        REC | {"lat": lat, "lon": lon, "time": "2026-10-01T11:00"},  # after fetched_at: forecast
    ]
    obs = backfill.om_obs(recs)
    d = {o.param: o.value for o in obs}
    assert {o.station_id for o in obs} == {"meteo:r1c1"}
    assert d["wind_ms"] == 10.0 and d["temp_c"] == 12.0 and "precip_mm" not in d
    assert len(obs) == 6


def test_sepa_obs_only_known_series():
    recs = [
        {"ts_id": "1", "timestamp": "2026-10-01T10:00:00.000Z", "value": 0.5},
        {"ts_id": "1", "timestamp": "2026-10-01T10:15:00.000Z", "value": -777},
        {"ts_id": "9", "timestamp": "2026-10-01T10:00:00.000Z", "value": 0.5},
    ]
    assert [o.station_id for o in backfill.sepa_obs(recs, {"sepa:1"})] == ["sepa:1"]


class FakeS3:
    def __init__(self, objects):
        self.objects, self.put = objects, {}

    def get_paginator(self, _):
        return self

    def paginate(self, Bucket, Prefix):
        return [{"Contents": [{"Key": k} for k in self.objects if k.startswith(Prefix)]}]

    def get_object(self, Bucket, Key):
        body = self.objects[Key]
        return {"Body": type("B", (), {"read": lambda s: body})()}

    def put_object(self, **kw):
        self.put[kw["Key"]] = kw


def test_backfill_then_dump_roundtrip(conn):
    from collectors.archive import grid_points

    lat, lon = grid_points()[0]
    ndjson = (json.dumps(REC | {"lat": lat, "lon": lon}) + "\n").encode()
    s3 = FakeS3(
        {
            "raw/open_meteo_ukmo/2026/10/01/1015.ndjson.gz": gzip.compress(ndjson),
            "raw/open_meteo_ukmo/2026/09/01/1015.ndjson.gz": gzip.compress(ndjson),
        }
    )
    assert backfill.backfill(conn, s3, "b", since="2026-10-01") == {"objects": 1, "inserted": 6}
    assert backfill.backfill(conn, s3, "b") == {
        "objects": 2,
        "inserted": 0,
    }  # idempotent, same rows
    assert conn.execute("select count(*) from ref.stations").fetchone() == (9,)

    assert dump.dump_day(conn, s3, "b", date(2026, 10, 1)) == 6
    sent = s3.put["dump/observations/2026/10/01.ndjson.gz"]
    lines = gzip.decompress(sent["Body"]).decode().splitlines()
    assert len(lines) == 6 and json.loads(lines[0])["station_id"] == "meteo:r0c0"
    assert dump.dump_day(conn, s3, "b", date(2026, 10, 2)) == 0  # nothing that day: no object


def test_uk_air_archive_roundtrip(conn):
    rec = {
        "ts_id": "1",
        "site": "Glasgow Test",
        "param": "pm25",
        "unit": "µg/m³",
        "lat": 55.86,
        "lon": -4.25,
        "timestamp": "2026-10-01T10:00:00+00:00",
        "value": 7.5,
    }
    s3 = FakeS3(
        {"raw/uk_air/2026/10/01/1015.ndjson.gz": gzip.compress((json.dumps(rec) + "\n").encode())}
    )
    assert backfill.backfill(conn, s3, "b")["inserted"] == 1
    assert backfill.backfill(conn, s3, "b")["inserted"] == 0
    assert conn.execute("select name from ref.stations where id = 'aq:glasgow-test'").fetchone()
