# SPDX-License-Identifier: AGPL-3.0-or-later
"""Collector parsing (recorded/hand-built payloads in the services' documented shape), retry and upsert."""

from datetime import UTC, datetime

from collectors import air_quality, sepa, weather

NOW = datetime(2026, 10, 1, 12, 30, tzinfo=UTC)


def om_point(hours=("2026-10-01T11:00", "2026-10-01T12:00", "2026-10-01T13:00")):
    n = len(hours)
    return {
        "hourly": {
            "time": list(hours),
            "temperature_2m": [10.0, 11.5, 12.0][:n],
            "precipitation": [0.0, 0.2, None][:n],
            "cloud_cover_low": [10, 20, 30][:n],
            "cloud_cover_mid": [0, 0, 0][:n],
            "cloud_cover_high": [100, 90, 80][:n],
            "wind_speed_10m": [3.1, 4.2, 5.3][:n],
            "wind_direction_10m": [200, 210, 220][:n],
        }
    }


def test_weather_parse_drops_forecast_and_nulls():
    obs = weather.parse([om_point(), om_point()], now=NOW)
    # 2 points x 2 past hours x 7 params (the 13:00 forecast hour is dropped)
    assert len(obs) == 28
    assert {o.station_id for o in obs} == {"meteo:r0c0", "meteo:r0c1"}
    t12 = [o for o in obs if o.station_id == "meteo:r0c0" and o.t.hour == 12]
    assert {o.param: o.value for o in t12}["temp_c"] == 11.5
    assert len(weather.stations()) == 9
    assert {s.id for s in weather.stations()} >= {"meteo:r0c0", "meteo:r1c1", "meteo:r2c2"}


def test_weather_parse_skips_null_values():
    p = om_point(("2026-10-01T11:00", "2026-10-01T12:00", "2026-10-01T13:00"))
    p["hourly"]["precipitation"] = [None, None, None]
    obs = weather.parse([p], now=NOW)
    assert "precip_mm" not in {o.param for o in obs}


CATALOGUE = {
    "stations": [
        {
            "station_no": "234",
            "station_name": "Kelvin at Kelvin Hall",
            "station_latitude": "55.8695",
            "station_longitude": "-4.2884",
            "river_name": "Kelvin",
            "series": {"level": {"ts_id": "101", "ts_name": "15m.Cmd.O"}},
        },
        {
            "station_no": "9",
            "station_name": "Glasgow Bishopton",
            "station_latitude": "55.9",
            "station_longitude": "-4.5",
            "series": {"rainfall": {"ts_id": "202", "ts_name": "15m.Total"}},
        },
    ]
}


def test_sepa_stations_and_parse():
    st = sepa.stations_from(CATALOGUE)
    assert [(s.id, s.kind, s.unit) for s in st] == [
        ("sepa:101", "river_level", "m"),
        ("sepa:202", "rainfall", "mm"),
    ]
    assert st[0].name == "Kelvin at Kelvin Hall (Kelvin)" and st[0].lon == -4.2884
    payload = [
        {
            "ts_id": "101",
            "data": [
                ["2026-10-01T10:00:00.000Z", 0.52],
                ["2026-10-01T10:15:00.000Z", -777],
                ["2026-10-01T10:30:00.000Z", None],
            ],
        },
        {"ts_id": "202", "data": [["2026-10-01T10:00:00.000Z", 0.0]]},
    ]
    obs = sepa.parse(payload)
    assert [(o.station_id, o.value) for o in obs] == [("sepa:101", 0.52), ("sepa:202", 0.0)]
    assert obs[0].t == datetime(2026, 10, 1, 10, 0, tzinfo=UTC)


def uk_air_items():
    def item(i, pollutant, site, uom="ug.m-3"):
        return {
            "id": str(i),
            "label": f"http://dd.eionet.europa.eu/vocabulary/aq/pollutant/{pollutant} {i} - {site}",
            "uom": uom,
            "station": {
                "properties": {"id": i, "label": f"{site}-Some pollutant (air)"},
                "geometry": {"coordinates": [55.86, -4.24, "NaN"], "type": "Point"},
            },
        }

    return [
        item(1, "8", "Glasgow Kerbside"),
        item(2, "6001", "Glasgow High Street"),
        item(3, "8", "Glasgow High Street"),
        item(4, "8", "London Marylebone Road"),  # not Glasgow
        item(5, "7", "Glasgow Townhead"),  # ozone, not wanted
    ]


def test_air_quality_discover_and_parse():
    found = air_quality.discover(uk_air_items())
    assert [(s["ts_id"], s["site"], s["param"]) for s in found] == [
        ("1", "Glasgow Kerbside", "no2"),
        ("2", "Glasgow High Street", "pm25"),
        ("3", "Glasgow High Street", "no2"),
    ]
    assert found[0]["lat"] == 55.86 and found[0]["lon"] == -4.24
    st = {s.id: s for s in air_quality.stations_from(found)}
    assert st["aq:glasgow-high-street"].param == "pm25"  # pm25 preferred as primary
    assert st["aq:glasgow-kerbside"].param == "no2"
    payload = {
        "values": [
            {"timestamp": 1790834400000, "value": 6.1},
            {"timestamp": 1790838000000, "value": None},
        ]
    }
    obs = air_quality.parse(payload, found[1])
    assert len(obs) == 1 and obs[0].station_id == "aq:glasgow-high-street" and obs[0].value == 6.1
