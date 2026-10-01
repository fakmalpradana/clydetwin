# SPDX-License-Identifier: AGPL-3.0-or-later
"""Import the R2 raw/ archive (written by collectors.archive since P1) into the live DB. Idempotent.

Usage: python -m collectors.backfill [--since YYYY-MM-DD]  (env DATABASE_URL, R2_*)
"""

import argparse
import gzip
import json
import os
from datetime import UTC, datetime

from collectors import weather
from collectors.archive import grid_points, s3_client
from collectors.common import Obs, connect, upsert

SEPA_MISSING = -777


def om_obs(records: list[dict]) -> list[Obs]:
    """Archive records are km/h for wind (live collector asks for m/s) and include forecast hours."""
    grid = {p: i for i, p in enumerate(grid_points())}
    obs = []
    for r in records:
        t = datetime.fromisoformat(r["time"]).replace(tzinfo=UTC)
        if t > datetime.fromisoformat(r["fetched_at"]):
            continue  # forecast hour at the time of the run, not an observation
        for var, param in weather.PARAMS.items():
            v = r.get(var)
            if v is None:
                continue
            v = v / 3.6 if var == "wind_speed_10m" else v
            obs.append(
                Obs(
                    station_id=weather.grid_id(grid[(r["lat"], r["lon"])]),
                    param=param,
                    t=t,
                    value=v,
                )
            )
    return obs


def sepa_obs(records: list[dict], known: set[str]) -> list[Obs]:
    """Only series already in ref.stations (the archive carries no coordinates to create new ones)."""
    return [
        Obs(station_id=f"sepa:{r['ts_id']}", t=r["timestamp"], value=r["value"])
        for r in records
        if f"sepa:{r['ts_id']}" in known and r["value"] not in (None, SEPA_MISSING)
    ]


def backfill(conn, s3, bucket: str, since: str = "") -> dict:
    upsert(conn, weather.stations(), [])
    known = {r[0] for r in conn.execute("select id from ref.stations")}
    conn.commit()
    stats = {"objects": 0, "inserted": 0}
    for source in ("open_meteo_ukmo", "sepa_kiwis"):
        for page in s3.get_paginator("list_objects_v2").paginate(
            Bucket=bucket, Prefix=f"raw/{source}/"
        ):
            for o in page.get("Contents", []):
                key = o["Key"]
                if "/".join(key.split("/")[2:5]) < since.replace("-", "/"):
                    continue
                body = gzip.decompress(s3.get_object(Bucket=bucket, Key=key)["Body"].read())
                recs = [json.loads(line) for line in body.splitlines()]
                obs = om_obs(recs) if source == "open_meteo_ukmo" else sepa_obs(recs, known)
                stats["inserted"] += upsert(conn, [], obs)
                conn.commit()
                stats["objects"] += 1
    return stats


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--since", default="", help="only archive objects from this UTC date (YYYY-MM-DD)"
    )
    a = ap.parse_args(argv)
    with connect() as conn:
        print(backfill(conn, s3_client(), os.environ["R2_BUCKET"], a.since))


if __name__ == "__main__":
    main()
