// SPDX-License-Identifier: AGPL-3.0-or-later
// Camera modes for /immersive beyond orbit: a drone tour through fixed landmarks, and following a vehicle.
import type { CameraState } from "./camera";
import { GEORGE_SQUARE } from "./tileset";

export type CamMode = "orbit" | "tour" | "follow";
export const isCamMode = (v: string | null): v is CamMode => v === "orbit" || v === "tour" || v === "follow";

export interface Landmark { name: string; lon: number; lat: number }
/** In flying order; the tour is a closed loop back to the first. */
export const LANDMARKS: Landmark[] = [
  { name: "George Square", lon: -4.2503, lat: 55.8617 },
  { name: "River Clyde", lon: -4.2620, lat: 55.8575 },
  { name: "SEC and Hydro", lon: -4.2866, lat: 55.8602 },
  { name: "Kelvingrove", lon: -4.2894, lat: 55.8688 },
  { name: "University of Glasgow", lon: -4.2886, lat: 55.8721 },
];
const STANDOFF_M = 400;
const TOUR_HEIGHT_M = 140;
const TARGET_HEIGHT_M = 40;

const M_LON = 62500, M_LAT = 111200; // metres per degree around Glasgow
const enu = (lon: number, lat: number): [number, number] => [(lon - GEORGE_SQUARE.lon) * M_LON, (lat - GEORGE_SQUARE.lat) * M_LAT];
const lonlat = (x: number, y: number): [number, number] => [GEORGE_SQUARE.lon + x / M_LON, GEORGE_SQUARE.lat + y / M_LAT];

/** Leg i (waypoint i to i+1) is flown at about 60 m/s on average, between 9 and 30 s. */
export const LEGS_S = LANDMARKS.map((_, i) => {
  const a = waypoint(i).pos, b = waypoint(i + 1).pos;
  return Math.min(30, Math.max(9, Math.hypot(b[0] - a[0], b[1] - a[1]) / 60));
});
export const TOUR_S = LEGS_S.reduce((s, v) => s + v, 0);
/** Seconds into the loop at which the camera is at waypoint i. */
export const legStart = (i: number) => LEGS_S.slice(0, i).reduce((s, v) => s + v, 0);
const smooth = (x: number) => x * x * (3 - 2 * x);
const deg = (r: number) => (r * 180) / Math.PI;

/** Camera at (x, y, z) in local metres looking at (tx, ty, tz). Heading is clockwise from north. */
function look(p: [number, number, number], t: [number, number, number]): CameraState {
  const dx = t[0] - p[0], dy = t[1] - p[1], dz = t[2] - p[2];
  const [lon, lat] = lonlat(p[0], p[1]);
  return { lon, lat, height: p[2], heading: (deg(Math.atan2(dx, dy)) + 360) % 360, pitch: deg(Math.atan2(dz, Math.hypot(dx, dy))) };
}

/** Waypoint i: STANDOFF_M behind landmark i (away from landmark i+1), at drone height. */
function waypoint(i: number): { pos: [number, number, number]; target: [number, number, number] } {
  const n = LANDMARKS.length;
  const a = enu(LANDMARKS[i % n].lon, LANDMARKS[i % n].lat);
  const b = enu(LANDMARKS[(i + 1) % n].lon, LANDMARKS[(i + 1) % n].lat);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return {
    pos: [a[0] - (STANDOFF_M * (b[0] - a[0])) / d, a[1] - (STANDOFF_M * (b[1] - a[1])) / d, TOUR_HEIGHT_M],
    target: [a[0], a[1], TARGET_HEIGHT_M],
  };
}

/** Drone pose `t` seconds into the loop: eased flight between waypoints while the gaze slides from landmark to landmark. */
export function tourPose(t: number): CameraState {
  const tt = ((t % TOUR_S) + TOUR_S) % TOUR_S;
  let i = 0;
  while (i < LEGS_S.length - 1 && tt >= legStart(i + 1)) i++;
  const k = smooth((tt - legStart(i)) / LEGS_S[i]);
  const a = waypoint(i), b = waypoint(i + 1);
  const mix = (p: number[], q: number[]) => p.map((v, j) => v + (q[j] - v) * k) as [number, number, number];
  return look(mix(a.pos, b.pos), mix(a.target, b.target));
}

export const FOLLOW_BACK_M = 300;
export const FOLLOW_UP_M = 120;

/** Chase camera: FOLLOW_BACK_M behind a vehicle on its heading, FOLLOW_UP_M above it, looking at it. */
export function followPose(v: { lon: number; lat: number; h: number }, headingDeg: number | null): CameraState {
  const hd = ((headingDeg ?? 0) * Math.PI) / 180;
  const [x, y] = enu(v.lon, v.lat);
  const p: [number, number, number] = [x - FOLLOW_BACK_M * Math.sin(hd), y - FOLLOW_BACK_M * Math.cos(hd), v.h + FOLLOW_UP_M];
  return look(p, [x, y, v.h]);
}

/** Time-lapse: the scene date shifted by `hours` (the scrubber covers +-12 h). */
export const TIMELAPSE_H = 12;
export const shiftedDate = (base: Date, hours: number) => new Date(base.getTime() + Math.max(-TIMELAPSE_H, Math.min(TIMELAPSE_H, hours)) * 3600000);
