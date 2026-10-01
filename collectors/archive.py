# SPDX-License-Identifier: AGPL-3.0-or-later
"""Phase 1 data archive (task 1.13): environmental history cannot be re-downloaded later, so start saving it now.

Every run writes one gzipped NDJSON object per source to R2:
    raw/{source}/{YYYY}/{MM}/{DD}/{HHMM}.ndjson.gz
Sources: `sepa_kiwis` (15-min river level and rainfall, stations inside the Glasgow AOI bbox) and
`open_meteo_ukmo` (hourly UKMO forecast/analysis on a 3x3 grid over the AOI). Overlapping windows are
intentional (a missed run loses nothing); deduplicate on (ts_id, timestamp) / (point, time) when reading.

Usage: python -m collectors.archive [--dry-run] [--refresh-stations]
Env (Actions secrets): R2_ACCOUNT_ENDPOINT (or R2_DEFAULT_ENDPOINTS locally), R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET.
"""

import argparse
import gzip
import io
import json
import os
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import requests

# Glasgow City + 500 m AOI bbox in lon/lat (from data/aoi.gpkg: E 249925-270934, N 655963-673571)
BBOX = (-4.42, 55.78, -4.04, 55.95)
KIWIS = "https://timeseries.sepa.org.uk/KiWIS/KiWIS"
STATIONS_FILE = Path(__file__).with_name("sepa_stations.json")
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
OM_VARS = [
    "temperature_2m",
    "precipitation",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "wind_speed_10m",
    "wind_direction_10m",
]
UA = {"User-Agent": "clydetwin-archive/0.1 (+https://github.com/fakmalpradana/clydetwin)"}


def _get(url: str, params: dict, tries: int = 4):
    for i in range(tries):
        r = requests.get(url, params=params, headers=UA, timeout=60)
        if r.status_code in (429, 500, 502, 503, 504) and i < tries - 1:
            time.sleep(5 * 2**i)
            continue
        r.raise_for_status()
        return r
    raise RuntimeError("unreachable")


# ---------------------------------------------------------------- SEPA KiWIS


def rows_to_dicts(payload: list) -> list[dict]:
    """KiWIS returns [[header...], [row...], ...] for list requests."""
    if not payload:
        return []
    head, *rows = payload
    return [dict(zip(head, row, strict=False)) for row in rows]


def classify(ts: dict) -> str | None:
    """'level' or 'rainfall' for the 15-minute series we want, else None."""
    name = " ".join(
        str(ts.get(k, "")) for k in ("stationparameter_name", "parametertype_name")
    ).lower()
    ts_name = str(ts.get("ts_name", "")).lower()
    if "15" not in ts_name:
        return None
    if re.search(r"\b(level|stage)\b", name) or "sg" in name.split():
        return "level"
    if re.search(r"rain|precip", name):
        return "rainfall"
    return None


def refresh_stations() -> dict:
    """Query KiWIS once for stations in the bbox and their 15-min level / rainfall series; cache as JSON."""
    base = {"service": "kisters", "type": "queryServices", "datasource": 0, "format": "json"}
    stations = rows_to_dicts(
        _get(
            KIWIS,
            base
            | {
                "request": "getStationList",
                "bbox": ",".join(map(str, BBOX)),
                "returnfields": "station_no,station_name,station_latitude,station_longitude,river_name",
            },
        ).json()
    )
    out = []
    for s in stations:
        series = rows_to_dicts(
            _get(
                KIWIS,
                base
                | {
                    "request": "getTimeseriesList",
                    "station_no": s["station_no"],
                    "returnfields": "ts_id,ts_name,parametertype_name,stationparameter_name",
                },
            ).json()
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


def parse_values(payload: list, meta: dict[str, dict]) -> list[dict]:
    """getTimeseriesValues -> flat records; `meta` maps ts_id to station/parameter info."""
    recs = []
    for block in payload:
        ts_id = str(block.get("ts_id"))
        info = meta.get(ts_id, {})
        for ts, value in block.get("data", []):
            recs.append({"ts_id": ts_id, **info, "timestamp": ts, "value": value})
    return recs


def collect_sepa(window: str = "PT2H") -> list[dict]:
    # committed cache; if absent, rebuild it for this run (costs one KiWIS request per station)
    data = json.loads(STATIONS_FILE.read_text()) if STATIONS_FILE.exists() else refresh_stations()
    stations = data["stations"]
    meta = {}
    for s in stations:
        for kind, ts in s["series"].items():
            meta[str(ts["ts_id"])] = {
                "station_no": s["station_no"],
                "station_name": s["station_name"],
                "parameter": kind,
            }
    r = _get(
        KIWIS,
        {
            "service": "kisters",
            "type": "queryServices",
            "datasource": 0,
            "format": "json",
            "request": "getTimeseriesValues",
            "ts_id": ",".join(meta),
            "period": window,
        },
    )
    return parse_values(r.json(), meta)


# ---------------------------------------------------------------- Open-Meteo


def grid_points(n: int = 3) -> list[tuple[float, float]]:
    """n x n lat/lon points evenly spaced inside the bbox (cell centres)."""
    w, s, e, nth = BBOX
    lons = [w + (e - w) * (i + 0.5) / n for i in range(n)]
    lats = [s + (nth - s) * (i + 0.5) / n for i in range(n)]
    return [(round(la, 4), round(lo, 4)) for la in lats for lo in lons]


def parse_open_meteo(payload: list | dict, points: list[tuple[float, float]]) -> list[dict]:
    """One record per grid point and hour."""
    payload = payload if isinstance(payload, list) else [payload]
    recs = []
    for (lat, lon), loc in zip(points, payload, strict=True):
        h = loc["hourly"]
        for i, t in enumerate(h["time"]):
            recs.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "grid_lat": loc["latitude"],
                    "grid_lon": loc["longitude"],
                    "time": t,
                }
                | {v: h[v][i] for v in OM_VARS}
            )
    return recs


def collect_open_meteo() -> list[dict]:
    pts = grid_points()
    r = _get(
        OPEN_METEO,
        {
            "latitude": ",".join(str(p[0]) for p in pts),
            "longitude": ",".join(str(p[1]) for p in pts),
            "hourly": ",".join(OM_VARS),
            "models": "ukmo_seamless",
            "past_hours": 3,
            "forecast_hours": 3,
            "timezone": "UTC",
        },
    )
    return parse_open_meteo(r.json(), pts)


# ---------------------------------------------------------------- R2


def to_ndjson_gz(records: list[dict], fetched_at: datetime) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as f:
        for rec in records:
            f.write(
                (
                    json.dumps(rec | {"fetched_at": fetched_at.isoformat()}, separators=(",", ":"))
                    + "\n"
                ).encode()
            )
    return buf.getvalue()


def object_key(source: str, t: datetime) -> str:
    return f"raw/{source}/{t:%Y/%m/%d}/{t:%H%M}.ndjson.gz"


def s3_client():
    import boto3

    endpoint = (
        os.environ.get("R2_ACCOUNT_ENDPOINT") or os.environ["R2_DEFAULT_ENDPOINTS"].split()[0]
    )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="fetch and parse, do not upload")
    ap.add_argument(
        "--refresh-stations",
        action="store_true",
        help="re-query KiWIS for the station cache and exit",
    )
    ap.add_argument(
        "--sources",
        default=os.environ.get("ARCHIVE_SOURCES", "sepa_kiwis,open_meteo_ukmo"),
        help="comma-separated sources to archive (env ARCHIVE_SOURCES)",
    )
    a = ap.parse_args(argv)
    if a.refresh_stations:
        d = refresh_stations()
        print(f"{len(d['stations'])} stations cached in {STATIONS_FILE.name}")
        return 0
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    now = now.replace(minute=now.minute - now.minute % 15)
    failed = 0
    s3 = None if a.dry_run else s3_client()
    collectors = {"sepa_kiwis": collect_sepa, "open_meteo_ukmo": collect_open_meteo}
    for source in a.sources.split(","):
        fn = collectors[source]
        try:
            recs = fn()
            if not recs:
                raise RuntimeError("no records returned")
            body = to_ndjson_gz(recs, datetime.now(UTC))
            key = object_key(source, now)
            if s3:
                s3.put_object(
                    Bucket=os.environ["R2_BUCKET"],
                    Key=key,
                    Body=body,
                    ContentType="application/x-ndjson",
                    ContentEncoding="gzip",
                )
            print(
                f"{source}: {len(recs)} records, {len(body)} bytes -> {key}{' (dry run)' if a.dry_run else ''}"
            )
        except Exception as e:  # one source failing must not stop the other
            failed += 1
            print(f"{source}: FAILED {type(e).__name__}: {e}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
