# SPDX-License-Identifier: AGPL-3.0-or-later
"""Daily dump of the live DB observations to R2: dump/observations/YYYY/MM/DD.ndjson.gz (one UTC day).

Keeps an off-VM copy of everything the VM ingested (the history cannot be re-downloaded). Overwrites the same
key when re-run, so a restart is harmless.
"""

import gzip
import json
from datetime import UTC, date, datetime, timedelta


def key(day: date) -> str:
    return f"dump/observations/{day:%Y/%m/%d}.ndjson.gz"


def dump_day(conn, s3, bucket: str, day: date) -> int:
    start = datetime(day.year, day.month, day.day, tzinfo=UTC)
    rows = conn.execute(
        "select station_id, param, t, value from ts.observations where t >= %s and t < %s order by t, station_id, param",
        (start, start + timedelta(days=1)),
    ).fetchall()
    if rows:
        body = "".join(
            json.dumps(
                {"station_id": s, "param": p, "t": t.isoformat(), "value": v}, separators=(",", ":")
            )
            + "\n"
            for s, p, t, v in rows
        )
        s3.put_object(
            Bucket=bucket,
            Key=key(day),
            Body=gzip.compress(body.encode(), mtime=0),
            ContentType="application/x-ndjson",
            ContentEncoding="gzip",
        )
    return len(rows)
