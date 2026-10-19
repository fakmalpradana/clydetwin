# SPDX-License-Identifier: AGPL-3.0-or-later
"""Glasgow Subway static reference: OSM railway=subway track (Overpass, ODbL) + NaPTAN stations (OGL) -> ref.subway_*.

One-off, not scheduled: `python -m collectors.subway` (env DATABASE_URL). Two requests in total.
Overpass etiquette: identifying User-Agent, no parallel runs (https://wiki.openstreetmap.org/wiki/Overpass_API).
"""

import csv
import io

import requests
from shapely.geometry import LineString, Point
from shapely.ops import linemerge

from collectors.common import UA, connect

OVERPASS = "https://overpass-api.de/api/interpreter"
QUERY = '[out:json][timeout:60];way["railway"="subway"](55.84,-4.33,55.88,-4.24);out geom;'
NAPTAN = "https://naptan.api.dft.gov.uk/v1/access-nodes"


def signed_area(line: LineString) -> float:
    xy = list(line.coords)
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(xy, xy[1:], strict=False)) / 2


def build(overpass: dict, naptan_csv: str) -> tuple[dict[str, LineString], list[dict]]:
    """The two longest merged ways are the two bores. Trains run clockwise on the Outer circle, so the
    clockwise bore is 'outer' and the anticlockwise one 'inner'."""
    ways = [
        LineString([(p["lon"], p["lat"]) for p in e["geometry"]])
        for e in overpass["elements"]
        if e["type"] == "way"
    ]
    merged = linemerge(ways)
    bores = sorted(getattr(merged, "geoms", [merged]), key=lambda g: -g.length)[:2]
    bores = [
        b if b.is_closed else LineString([*b.coords, b.coords[0]]) for b in bores
    ]  # one bore has a ~50 m gap
    tracks = {("outer" if signed_area(b) < 0 else "inner"): b for b in bores}
    if set(tracks) != {"inner", "outer"}:
        raise ValueError("expected one clockwise and one anticlockwise bore")
    stations = [
        {
            "atco": r["ATCOCode"],
            "name": r["CommonName"].removesuffix(" SPT Subway Station"),
            "geom": Point(float(r["Longitude"]), float(r["Latitude"])),
        }
        for r in csv.DictReader(io.StringIO(naptan_csv))
        if r["StopType"] == "MET" and r["CommonName"].endswith("SPT Subway Station")
    ]
    if len(stations) != 15:
        raise ValueError(f"expected 15 subway stations, got {len(stations)}")
    return tracks, stations


def fetch() -> tuple[dict[str, LineString], list[dict]]:
    o = requests.post(OVERPASS, data={"data": QUERY}, headers=UA, timeout=90)
    o.raise_for_status()
    n = requests.get(
        NAPTAN, params={"dataFormat": "csv", "atcoAreaCodes": "940"}, headers=UA, timeout=90
    )
    n.raise_for_status()
    return build(o.json(), n.text)


def load(conn, tracks, stations) -> None:
    with conn.cursor() as cur:
        for circle, g in tracks.items():
            cur.execute(
                """insert into ref.subway_track (circle, geom) values (%s, st_geomfromtext(%s, 4326))
                   on conflict (circle) do update set geom = excluded.geom""",
                (circle, g.wkt),
            )
        cur.executemany(
            """insert into ref.subway_station (atco, name, geom)
               values (%(atco)s, %(name)s, st_geomfromtext(%(wkt)s, 4326))
               on conflict (atco) do update set name = excluded.name, geom = excluded.geom""",
            [s | {"wkt": s["geom"].wkt} for s in stations],
        )


if __name__ == "__main__":
    tracks, stations = fetch()
    with connect() as conn:
        load(conn, tracks, stations)
    print({c: round(g.length * 111000) for c, g in tracks.items()}, len(stations), "stations")
