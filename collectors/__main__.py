# SPDX-License-Identifier: AGPL-3.0-or-later
"""Scheduler loop for the live collectors. Usage: python -m collectors (env DATABASE_URL, LIVE_SOURCES)."""

import os
import time
from datetime import UTC, datetime, timedelta

from collectors import air_quality, dump, sepa, weather
from collectors.archive import s3_client
from collectors.common import SOURCES, connect, run

COLLECTORS = {"open-meteo": weather.collect, "uk-air": air_quality.collect, "sepa": sepa.collect}
BACKOFF = 4  # a rate-limited source (SEPA 429) waits this many intervals before the next try


def dump_yesterday(day) -> None:
    """Off-VM copy of yesterday's observations; failures are logged, never fatal."""
    try:
        with connect() as conn:
            n = dump.dump_day(conn, s3_client(), os.environ["R2_BUCKET"], day)
        print(f"dump {day}: {n} rows -> R2", flush=True)
    except Exception as e:
        print(f"dump {day} FAILED {type(e).__name__}: {e}", flush=True)


def main() -> None:
    enabled = [s.strip() for s in os.environ.get("LIVE_SOURCES", "open-meteo,uk-air").split(",")]
    unknown = [s for s in enabled if s not in COLLECTORS]
    if unknown:
        raise SystemExit(f"unknown LIVE_SOURCES: {unknown}; known: {list(COLLECTORS)}")
    due = dict.fromkeys(enabled, 0.0)
    print(f"collectors: {enabled}", flush=True)
    dump_on = bool(os.environ.get("R2_BUCKET") and os.environ.get("R2_ACCESS_KEY_ID"))
    dumped = None
    while True:
        now = time.time()
        for s in enabled:
            if now >= due[s]:
                status = run(s, COLLECTORS[s])
                print(f"{time.strftime('%FT%TZ', time.gmtime())} {s}: {status}", flush=True)
                due[s] = now + SOURCES[s] * (BACKOFF if status == "rate_limited" else 1)
        today = datetime.now(UTC).date()
        if dump_on and dumped != today:
            dump_yesterday(today - timedelta(days=1))
            dumped = today
        time.sleep(10)


if __name__ == "__main__":
    main()
