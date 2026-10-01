# SPDX-License-Identifier: AGPL-3.0-or-later
"""Parsing of KiWIS and Open-Meteo payloads (shapes taken from the services' documented/observed responses)."""

import gzip
import json
from datetime import UTC, datetime

from collectors import archive


def test_rows_to_dicts_and_classify():
    payload = [
        ["ts_id", "ts_name", "parametertype_name", "stationparameter_name"],
        ["1", "15m.Cmd.O", "SG", "Level"],
        ["2", "15m.Total", "N", "Rainfall"],
        ["3", "HourTotal", "N", "Rainfall"],
        ["4", "Day.Mean", "SG", "Level"],
    ]
    rows = archive.rows_to_dicts(payload)
    assert [archive.classify(r) for r in rows] == ["level", "rainfall", None, None]
    assert archive.rows_to_dicts([]) == []


def test_parse_values():
    payload = [
        {"ts_id": "1", "rows": "2", "columns": "Timestamp,Value",
         "data": [["2026-10-01T10:00:00.000Z", 0.52], ["2026-10-01T10:15:00.000Z", 0.53]]},
        {"ts_id": "2", "rows": "0", "columns": "Timestamp,Value", "data": []},
    ]  # fmt: skip
    meta = {"1": {"station_no": "A", "parameter": "level"}}
    recs = archive.parse_values(payload, meta)
    assert recs == [
        {
            "ts_id": "1",
            "station_no": "A",
            "parameter": "level",
            "timestamp": "2026-10-01T10:00:00.000Z",
            "value": 0.52,
        },
        {
            "ts_id": "1",
            "station_no": "A",
            "parameter": "level",
            "timestamp": "2026-10-01T10:15:00.000Z",
            "value": 0.53,
        },
    ]


def test_grid_is_3x3_inside_bbox():
    pts = archive.grid_points()
    w, s, e, n = archive.BBOX
    assert len(pts) == 9 and len(set(pts)) == 9
    assert all(s < la < n and w < lo < e for la, lo in pts)


def test_parse_open_meteo_multi_point():
    pts = [(55.8, -4.3), (55.9, -4.1)]
    hourly = {"time": ["2026-10-01T10:00", "2026-10-01T11:00"]} | {
        v: [1, 2] for v in archive.OM_VARS
    }
    payload = [
        {"latitude": 55.81, "longitude": -4.31, "hourly": hourly},
        {"latitude": 55.91, "longitude": -4.11, "hourly": hourly},
    ]
    recs = archive.parse_open_meteo(payload, pts)
    assert len(recs) == 4 and recs[0]["cloud_cover_low"] == 1 and recs[3]["lat"] == 55.9
    assert {"cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "precipitation"} <= recs[
        0
    ].keys()


def test_ndjson_roundtrip_and_key():
    t = datetime(2026, 10, 1, 14, 15, tzinfo=UTC)
    body = archive.to_ndjson_gz([{"a": 1}, {"a": 2}], t)
    lines = gzip.decompress(body).decode().splitlines()
    assert [json.loads(x)["a"] for x in lines] == [1, 2]
    assert archive.object_key("sepa_kiwis", t) == "raw/sepa_kiwis/2026/10/01/1415.ndjson.gz"


def test_collect_uk_air_flattens_and_skips_nulls(monkeypatch):
    from collectors import air_quality

    s = {"ts_id": "5", "site": "Glasgow X", "param": "no2", "unit": "µg/m³", "lat": 1.0, "lon": 2.0}
    payload = {
        "values": [
            {"timestamp": 1790848800000, "value": 3.0},
            {"timestamp": 1790852400000, "value": None},
        ]
    }
    monkeypatch.setattr(air_quality, "fetch", lambda: [(s, payload)])
    recs = archive.collect_uk_air()
    assert (
        len(recs) == 1
        and recs[0]["site"] == "Glasgow X"
        and recs[0]["timestamp"].endswith("+00:00")
    )
