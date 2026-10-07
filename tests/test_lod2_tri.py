# SPDX-License-Identifier: AGPL-3.0-or-later
"""LoD2 face triangulation in metres: area, containment and winding on synthetic faces, area on the real pilot."""

import numpy as np
import pytest
from shapely.geometry import Point, Polygon

from pipelines import config, lod2_qa
from pipelines.lod2_tiles import building_faces, face_area, newell_normal, triangulate_face


def _lift(xy, origin, u, v):
    xy = np.asarray(xy, float)
    return np.asarray(origin, float) + np.outer(xy[:, 0], u) + np.outer(xy[:, 1], v)


def _check(outer, holes, normal_sign=1):
    tris = triangulate_face(outer, holes)
    assert tris
    total = sum(np.linalg.norm(newell_normal(t)) / 2 for t in tris)
    assert total == pytest.approx(face_area(outer, holes), rel=1e-6)
    n = newell_normal(outer)
    n /= np.linalg.norm(n)
    for t in tris:
        tn = newell_normal(t)
        assert tn @ n > 0  # winding follows the face
        assert tn @ n / np.linalg.norm(tn) == pytest.approx(1.0, abs=1e-9)
    return tris


L = [(0, 0), (10, 0), (10, 3), (3, 3), (3, 8), (0, 8)]  # concave L


def test_l_shaped_vertical_wall():
    # wall in the plane y = const-ish (BNG-sized offsets), x along u, z up
    o = [259000.0, 665000.0, 20.0]
    outer = _lift(L, o, [1, 0, 0], [0, 0, 1])
    tris = _check(outer, [])
    poly = Polygon(L)
    inv = np.array([[t[:, 0].mean() - o[0], t[:, 2].mean() - o[2]] for t in tris])
    assert all(poly.contains(Point(c)) for c in inv)


def test_sloped_concave_roof_either_winding():
    u, v = np.array([1, 0, 0.0]), np.array([0, 0.8, 0.6])  # 36.9 deg slope
    outer = _lift(L, [259000.0, 665000.0, 30.0], u, v)
    _check(outer, [])
    # reversed ring = flipped normal; triangles must follow it
    tris = triangulate_face(outer[::-1], [])
    n = newell_normal(outer[::-1])
    assert all(newell_normal(t) @ n > 0 for t in tris)


def test_face_with_hole():
    u, v = np.array([0.6, 0.8, 0]), np.array([0, 0, 1.0])
    sq = [(0, 0), (12, 0), (12, 12), (0, 12)]
    hole = [(4, 4), (4, 8), (8, 8), (8, 4)]  # CW hole
    o = [259000.0, 665000.0, 5.0]
    outer, h = _lift(sq, o, u, v), _lift(hole, o, u, v)
    tris = _check(outer, [h])
    assert face_area(outer, [h]) == pytest.approx(144 - 16)
    for t in tris:  # no triangle covers the hole centre
        assert not Polygon((t - o) @ np.column_stack([u, v])).contains(Point(6, 6))


PILOT = config.ROOT / "build" / "pilot" / "cx3_beta"


@pytest.mark.skipif(not PILOT.exists(), reason="pilot roofer output not built")
def test_pilot_area_preserved_per_building():
    worst = 0.0
    for f in lod2_qa.read_cjseq(next(PILOT.glob("*.city.jsonl"))):
        faces = list(building_faces(f))
        src = sum(face_area(o, h) for o, h in faces)
        tri = sum(
            np.linalg.norm(newell_normal(t)) / 2 for o, h in faces for t in triangulate_face(o, h)
        )
        if src:
            worst = max(worst, abs(tri - src) / src)
    print(f"max per-building area deviation {worst:.3%}")
    assert worst < 0.005
