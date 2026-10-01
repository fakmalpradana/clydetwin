# SPDX-License-Identifier: AGPL-3.0-or-later
"""Simulated Glasgow Subway (docs/phases/P3.md A3): a deterministic function of the timetable and `at`.

Model: each circle is a loop (ref.subway_track). Trains leave Govan on the published headway and run one
24-minute circuit at constant speed (no dwell at stations), so a train's position is pure arithmetic.
Timetable (spt.co.uk/subway, checked 2026-10-01): Mon-Sat first departure 06:30, last 23:16; Sunday 10:00 to 17:50;
24 min round trip; every 4 min at peak, 6-8 min off-peak (we use 7; Sunday 8). Peak = 07:00-09:30 and
16:00-18:30 Mon-Fri (the page does not define peak hours; an assumption). Inner and outer share the schedule.
"""

import math
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from psycopg.rows import tuple_row
from shapely import wkt
from shapely.geometry import LineString, Point

LONDON = ZoneInfo("Europe/London")
CIRCUIT_S = 24 * 60
HEIGHT_M = 45.0  # nominal ellipsoidal height (about 0 m ODN + ~52 m geoid, tunnels are 10-30 m down); depth not modelled
M_LAT = 111_200.0


def headway_s(local: datetime) -> int:
    if local.weekday() == 6:
        return 8 * 60
    peak = local.weekday() < 5 and (
        time(7) <= local.time() < time(9, 30) or time(16) <= local.time() < time(18, 30)
    )
    return (4 if peak else 7) * 60


def departures(day: datetime) -> list[datetime]:
    """All Govan departures on the local calendar day of `day` (tz-aware)."""
    d = day.astimezone(LONDON).date()
    sunday = d.weekday() == 6
    t = datetime.combine(d, time(10) if sunday else time(6, 30), LONDON)
    last = datetime.combine(d, time(17, 50) if sunday else time(23, 16), LONDON)
    out = []
    while t <= last:
        out.append(t)
        t += timedelta(seconds=headway_s(t))
    return out


class Loop:
    """A closed track in a local metric frame, with a start offset (Govan) and running direction."""

    def __init__(self, coords: list[tuple[float, float]], origin: tuple[float, float]):
        self.kx = M_LAT * math.cos(math.radians(coords[0][1]))
        self.line = LineString([(x * self.kx, y * M_LAT) for x, y in coords])
        self.length = self.line.length
        self.s0 = self.line.project(Point(origin[0] * self.kx, origin[1] * M_LAT))

    def at(self, elapsed_s: float) -> tuple[float, float, float]:
        """(lon, lat, heading_deg) after `elapsed_s` seconds on the circuit."""
        s = (self.s0 + elapsed_s / CIRCUIT_S * self.length) % self.length
        p, q = self.line.interpolate(s), self.line.interpolate((s + 5) % self.length)
        heading = math.degrees(math.atan2(q.x - p.x, q.y - p.y)) % 360
        return p.x / self.kx, p.y / M_LAT, heading

    @property
    def speed_ms(self) -> float:
        return self.length / CIRCUIT_S


def positions(loops: dict[str, Loop], at: datetime) -> list[dict]:
    """GeoJSON features for every simulated train running at `at` (tz-aware or naive UTC)."""
    at = at.replace(tzinfo=UTC) if at.tzinfo is None else at
    feats = []
    for circle, loop in sorted(loops.items()):
        for dep in departures(at):
            elapsed = (at - dep).total_seconds()
            if not 0 <= elapsed < CIRCUIT_S:
                continue
            lon, lat, heading = loop.at(elapsed)
            feats.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat, HEIGHT_M]},
                    "properties": {
                        "id": f"subway:{circle}:{dep.astimezone(UTC):%Y%m%dT%H%M}",
                        "kind": "subway",
                        "label": f"{circle.capitalize()} circle",
                        "mode": "simulated",
                        "heading_deg": round(heading, 1),
                        "speed_ms": round(loop.speed_ms, 1),
                        "t": at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
                    },
                }
            )
    return feats


def load_loops(conn) -> dict[str, Loop]:
    """Loops from ref.*; origin = Govan. Empty until `python -m collectors.subway` has run."""
    cur = conn.cursor(row_factory=tuple_row)
    govan = cur.execute(
        "select st_x(geom), st_y(geom) from ref.subway_station where name = 'Govan'"
    ).fetchone()
    return {
        c: Loop(list(wkt.loads(w).coords), govan)
        for c, w in cur.execute("select circle, st_astext(geom) from ref.subway_track")
    }
