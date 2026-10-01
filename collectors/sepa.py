# SPDX-License-Identifier: AGPL-3.0-or-later
"""SEPA KiWIS 15-minute river level and rainfall for stations inside the AOI bbox.

SEPA answers HTTP 429 per IP (credit limit). Here 429 is never retried: the run is logged `rate_limited`,
the source goes stale in /health and the scheduler backs it off. The station catalogue is cached in
collectors/sepa_stations.json (same file as the R2 archive); it is only rebuilt when that file is missing
(`python -m collectors.sepa --refresh`).
"""

import json
import sys
from datetime import UTC, datetime

from collectors.archive import BBOX, KIWIS, STATIONS_FILE, classify, parse_values, rows_to_dicts
from collectors.common import Obs, Station, get_json

SOURCE = "sepa"
UNITS = {"level": "m", "rainfall": "mm"}
KIND = {"level": "river_level", "rainfall": "rainfall"}
MISSING = -777  # KiWIS gap marker
BASE = {"service": "kisters", "type": "queryServices", "datasource": 0, "format": "json"}


def _kiwis(params: dict):
    return get_json(KIWIS, BASE | params, retry_429=False)


def build_catalogue() -> dict:
    stations = rows_to_dicts(
        _kiwis(
            {
                "request": "getStationList",
                "bbox": ",".join(map(str, BBOX)),
                "returnfields": "station_no,station_name,station_latitude,station_longitude,river_name",
            }
        )
    )
    out = []
    for s in stations:
        series = rows_to_dicts(
            _kiwis(
                {
                    "request": "getTimeseriesList",
                    "station_no": s["station_no"],
                    "returnfields": "ts_id,ts_name,parametertype_name,stationparameter_name",
                }
            )
        )
        wanted = {}
        for ts in series:
            kind = classify(ts)
            if kind and kind not in wanted:
                wanted[kind] = {"ts_id": ts["ts_id"], "ts_name": ts["ts_name"]}
        if wanted:
            out.append(s | {"series": wanted})
    data = {"bbox": BBOX, "retrieved": datetime.now(UTC).strftime("%Y-%m-%d"), "stations": out}
    STATIONS_FILE.write_text(json.dumps(data, indent=1) + "\n")
    return data


def stations_from(catalogue: dict) -> list[Station]:
    out = []
    for s in catalogue["stations"]:
        river = f" ({s['river_name']})" if s.get("river_name") else ""
        for param, ts in s["series"].items():
            out.append(
                Station(
                    id=f"sepa:{ts['ts_id']}",
                    source=SOURCE,
                    kind=KIND[param],
                    name=f"{s['station_name']}{river}",
                    unit=UNITS[param],
                    interval_s=900,
                    lon=float(s["station_longitude"]),
                    lat=float(s["station_latitude"]),
                )
            )
    return out


def parse(payload: list) -> list[Obs]:
    """getTimeseriesValues -> observations; ts_id keys the station, gaps (null / -777) dropped."""
    return [
        Obs(station_id=f"sepa:{r['ts_id']}", t=r["timestamp"], value=r["value"])
        for r in parse_values(payload, {})
        if r["value"] is not None and r["value"] != MISSING
    ]


def collect(window: str = "PT2H"):
    cat = json.loads(STATIONS_FILE.read_text()) if STATIONS_FILE.exists() else build_catalogue()
    stations = stations_from(cat)
    if not stations:
        return [], []
    ids = ",".join(s.id.removeprefix("sepa:") for s in stations)
    payload = _kiwis({"request": "getTimeseriesValues", "ts_id": ids, "period": window})
    return stations, parse(payload)


if __name__ == "__main__" and "--refresh" in sys.argv:
    print(f"{len(build_catalogue()['stations'])} stations cached in {STATIONS_FILE.name}")
