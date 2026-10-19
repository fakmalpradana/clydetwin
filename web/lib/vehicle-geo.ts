// SPDX-License-Identifier: AGPL-3.0-or-later
// Spherical lon/lat helpers (fine at city scale), split out so the fixture and vehicles.ts do not import each other.
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Move a lon/lat point `m` metres along a compass bearing (spherical, fine at city scale). */
export function offset(lon: number, lat: number, bearingDeg: number, m: number): { lon: number; lat: number } {
  const b = rad(bearingDeg), d = m / R, p = rad(lat);
  const lat2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b));
  const lon2 = rad(lon) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(lat2));
  return { lon: deg(lon2), lat: deg(lat2) };
}

/** Initial compass bearing from a to b, degrees in [0, 360). */
export function bearing(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dl = rad(b.lon - a.lon), p1 = rad(a.lat), p2 = rad(b.lat);
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
