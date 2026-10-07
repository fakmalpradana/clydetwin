// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure data -> look mappings for the Clyde water (see components/waterMesh.ts): flow, ripples, sky and sun colour.
import { rainIntensity } from "./weatherfx";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));
const mix3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Murky tidal Clyde: grey-brown shallows and dark green-brown depths (linear sRGB). */
export const WATER_DEEP: [number, number, number] = [0.018, 0.026, 0.02];
export const WATER_SHALLOW: [number, number, number] = [0.06, 0.055, 0.035];

/** Ripple look from wind (m/s) and precipitation (mm/h): scroll speed, normal strength, and a fine rain-ripple amount 0-1. */
export function rippleParams(wind_ms: number, precip_mm: number) {
  const w = clamp(wind_ms, 0, 25);
  return { speed: 0.6 + 0.08 * w, strength: 0.35 + 0.04 * w, fine: rainIntensity(precip_mm) };
}

/** Colour of the sky seen in the water, from the sun elevation (deg) and mean cloud cover (%): blue by day, warm at dusk, dark at night, greyer under cloud. */
export function skyTint(elevationDeg: number, cloudPct: number): [number, number, number] {
  const clear = mix3([0.1, 0.16, 0.28], [0.34, 0.17, 0.1], 1 - smooth(4, 35, elevationDeg));
  const grey = clear.reduce((s, v) => s + v, 0) / 3;
  const overcast = clamp(cloudPct, 0, 100) / 100;
  const day = mix3(clear, [grey, grey, grey * 1.05], 0.7 * overcast);
  const light = 0.015 + 0.985 * smooth(-8, 8, elevationDeg);
  return day.map((v) => v * light) as [number, number, number];
}

/** Direct sun strength seen as a glint: 0 below the horizon, warmer and weaker when low, killed by cloud. */
export function sunGlint(elevationDeg: number, cloudPct: number): [number, number, number] {
  const k = smooth(0, 10, elevationDeg) * (1 - 0.85 * (clamp(cloudPct, 0, 100) / 100));
  return mix3([2.4, 1.2, 0.55], [3, 2.7, 2.3], smooth(2, 25, elevationDeg)).map((v) => v * k) as [number, number, number];
}

/** Downstream centreline of the tidal Clyde, east (Glasgow Green weir) to west (towards Clydebank), [lon, lat]. */
export const CENTRELINE: [number, number][] = [
  [-4.2385, 55.8455], [-4.245, 55.851], [-4.25, 55.8534], [-4.26, 55.8559], [-4.27, 55.856], [-4.28, 55.8571],
  [-4.29, 55.8595], [-4.3, 55.8615], [-4.31, 55.8649], [-4.32, 55.8672], [-4.33, 55.8676], [-4.34, 55.8698],
  [-4.35, 55.8715], [-4.36, 55.8774], [-4.37, 55.8819], [-4.38, 55.8853], [-4.39, 55.8887], [-4.4, 55.8903],
];
const M_LON = 62500, M_LAT = 111200;

/** Unit flow direction [east, north] at a point: along the nearest centreline segment, downstream (westward). */
export function flowAt(lon: number, lat: number): [number, number] {
  let best = Infinity, dir: [number, number] = [-1, 0];
  for (let i = 0; i + 1 < CENTRELINE.length; i++) {
    const [ax, ay] = CENTRELINE[i], [bx, by] = CENTRELINE[i + 1];
    const dx = (bx - ax) * M_LON, dy = (by - ay) * M_LAT, px = (lon - ax) * M_LON, py = (lat - ay) * M_LAT;
    const t = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1);
    const d = Math.hypot(px - t * dx, py - t * dy);
    if (d < best) {
      best = d;
      const l = Math.hypot(dx, dy);
      dir = [dx / l, dy / l];
    }
  }
  return dir;
}
