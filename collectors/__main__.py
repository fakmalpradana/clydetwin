# SPDX-License-Identifier: AGPL-3.0-or-later
"""Scheduler loop for the live collectors. Usage: python -m collectors (env DATABASE_URL, LIVE_SOURCES)."""

import os
import time

from collectors import air_quality, sepa, weather
from collectors.common import SOURCES, run

COLLECTORS = {"open-meteo": weather.collect, "uk-air": air_quality.collect, "sepa": sepa.collect}
BACKOFF = 4  # a rate-limited source (SEPA 429) waits this many intervals before the next try


def main() -> None:
    enabled = [s.strip() for s in os.environ.get("LIVE_SOURCES", "open-meteo,uk-air").split(",")]
    unknown = [s for s in enabled if s not in COLLECTORS]
    if unknown:
        raise SystemExit(f"unknown LIVE_SOURCES: {unknown}; known: {list(COLLECTORS)}")
    due = dict.fromkeys(enabled, 0.0)
    print(f"collectors: {enabled}", flush=True)
    while True:
        now = time.time()
        for s in enabled:
            if now >= due[s]:
                status = run(s, COLLECTORS[s])
                print(f"{time.strftime('%FT%TZ', time.gmtime())} {s}: {status}", flush=True)
                due[s] = now + SOURCES[s] * (BACKOFF if status == "rate_limited" else 1)
        time.sleep(10)


if __name__ == "__main__":
    main()
