// SPDX-License-Identifier: AGPL-3.0-or-later
// River Clyde water surface for /immersive: mesh from the simplified OS OpenMap Local polygons, level from the gauges.
import { ShapeUtils, Vector2 } from "three";
import { effectiveStatus, type StationFeature } from "./api";
import { GEORGE_SQUARE } from "./tileset";
import { bankDistance } from "./waterfx";

export const WATER_URL = "/data/clyde_water.geojson";

/**
 * Dry-weather surface, ellipsoidal m. Our terrain is flat at 52.8 m over the tidal Clyde (raycast at George Square, the
 * LiDAR water surface); 0.2 m above it keeps the plane visible without floating. Upstream of the Glasgow Green weir the
 * river is higher than this, so the polygons stop at the weir.
 */
export const WATER_H = 53;
/** Gauge reading (m, gauge datum) treated as "normal"; the surface moves 1:1 with the reading around it, within +-1.5 m. */
export const GAUGE_NORMAL_M = 2;
export const MAX_RISE_M = 1.5;

export interface WaterLevel {
  /** Ellipsoidal height of the surface, m. */
  h: number;
  source: "gauge" | "constant";
  gauge?: string;
}

const dist2 = (f: StationFeature) => (f.geometry.coordinates[0] - GEORGE_SQUARE.lon) ** 2 + (f.geometry.coordinates[1] - GEORGE_SQUARE.lat) ** 2;

/** Surface height from the Clyde gauge nearest George Square that has a fresh reading, else the documented constant. */
export function waterLevel(stations: StationFeature[], now = Date.now()): WaterLevel {
  const g = stations
    .filter((f) => f.properties.kind === "river_level" && /clyde/i.test(f.properties.name) && f.properties.latest && effectiveStatus(f.properties, now) !== "stale")
    .sort((a, b) => dist2(a) - dist2(b))[0];
  if (!g?.properties.latest) return { h: WATER_H, source: "constant" };
  const rise = Math.max(-MAX_RISE_M, Math.min(MAX_RISE_M, g.properties.latest.value - GAUGE_NORMAL_M));
  return { h: WATER_H + rise, source: "gauge", gauge: g.properties.name };
}

type Ring = [number, number][];
export interface WaterMesh {
  /** lon, lat pairs */
  xy: number[];
  index: number[];
  /** per vertex: distance (m) to the nearest polygon edge, the proxy for water depth (see waterfx.ts depthFromBank) */
  bank: number[];
}

/** Triangulate polygons (lon/lat) and split triangles until every edge is <= maxEdgeM, so a flat mesh follows the Earth's curve. */
export function buildWater(polys: { coordinates: Ring[] }[], maxEdgeM = 40): WaterMesh {
  const xy: number[] = [];
  const index: number[] = [];
  const bank: number[] = [];
  const len = (a: number, b: number) => Math.hypot((xy[2 * a] - xy[2 * b]) * 62500, (xy[2 * a + 1] - xy[2 * b + 1]) * 111200);
  const mid = (a: number, b: number) => {
    xy.push((xy[2 * a] + xy[2 * b]) / 2, (xy[2 * a + 1] + xy[2 * b + 1]) / 2);
    return xy.length / 2 - 1;
  };
  const split = (a: number, b: number, c: number) => {
    const e = [len(a, b), len(b, c), len(c, a)];
    const m = Math.max(...e);
    if (m <= maxEdgeM) return void index.push(a, b, c);
    // cut the longest edge at its midpoint
    const [p, q, r] = e[0] === m ? [a, b, c] : e[1] === m ? [b, c, a] : [c, a, b];
    const n = mid(p, q);
    split(p, n, r);
    split(n, q, r);
  };
  for (const poly of polys) {
    const rings = poly.coordinates.map((r) => r.slice(0, -1).map(([x, y]) => new Vector2(x, y)));
    const base = xy.length / 2;
    const flat = rings.flat();
    for (const v of flat) xy.push(v.x, v.y);
    const tris = ShapeUtils.triangulateShape(rings[0], rings.slice(1));
    for (const [a, b, c] of tris) split(base + a, base + b, base + c);
    const n = xy.length / 2;
    for (let i = base; i < n; i++) bank[i] = bankDistance(xy[2 * i], xy[2 * i + 1], poly.coordinates);
  }
  return { xy, index, bank };
}
