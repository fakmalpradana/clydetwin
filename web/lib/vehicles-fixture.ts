// SPDX-License-Identifier: AGPL-3.0-or-later
// Generated sample mobility data for fixture mode: aircraft on a 3 degree glide to EGPF runway 23, and subway
// trains on an ellipse that approximates the circle. Pure functions of time, so replay tracks match live positions.
// Everything here is invented: the UI labels it SAMPLE DATA and the mode is "simulated".
import { bearing, offset } from "./vehicle-geo";
import type { Mode, Sample, Tracks, VKind, VehicleCollection, VehicleFeature } from "./vehicles";
import { FLAT_GROUND_M } from "./tileset";

// Runway 23 threshold: ARP 55.8719 N, 4.4331 W plus half of the 2,658 m runway toward 054 deg. Final approach comes in from the NE.
const THR = offset(-4.4331, 55.8719, 54, 1329);
const APPROACH_BRG = 54, HEADING = 234, APPROACH_M = 20000, ROLLOUT_M = 1000, ACTIVE_S = 300, LAP_S = 1500;
const SLOTS = ["BAW1481", "EZY82MK", "LOG3PE", "RYR4WD"];

const iso = (ms: number) => new Date(ms).toISOString();
const lap = (slot: number, ms: number) => {
  const x = ms / 1000 + slot * 370;
  return { n: Math.floor(x / LAP_S), phase: x % LAP_S };
};
const aircraftAt = (slot: number, ms: number) => {
  const { n, phase } = lap(slot, ms);
  if (phase >= ACTIVE_S) return null;
  const d = APPROACH_M - ((APPROACH_M + ROLLOUT_M) / ACTIVE_S) * phase; // m before the threshold
  const p = offset(THR.lon, THR.lat, APPROACH_BRG, d);
  // 3 degree glide (tan = 0.0524) down to a 15 m flare over the threshold, then on the runway.
  const h = FLAT_GROUND_M + (d > 0 ? Math.min(d, 300) / 20 + Math.max(0, d - 300) * 0.0524 : 0);
  const kt = (APPROACH_M + ROLLOUT_M) / ACTIVE_S;
  return { id: `fx-ac-${slot}-${n}`, label: SLOTS[slot], ...p, h, heading_deg: HEADING, speed_ms: Math.round(kt * 10) / 10 };
};

// Ellipse ~9.7 km round, centred on the city centre; inner circle runs clockwise, outer anticlockwise.
const C = { lon: -4.27, lat: 55.86 }, A_LON = 0.028, B_LAT = 0.0075, SUBWAY_S = 1700, TRAINS = 4;
const ellipse = (th: number) => ({ lon: C.lon + A_LON * Math.cos(th), lat: C.lat + B_LAT * Math.sin(th) });
const subwayAt = (i: number, ms: number) => {
  const dir = i % 2 ? -1 : 1; // inner = anticlockwise (th grows), outer = clockwise
  const th = dir * 2 * Math.PI * (((ms / 1000 + i * (SUBWAY_S / TRAINS)) % SUBWAY_S) / SUBWAY_S);
  const p = ellipse(th), q = ellipse(th + dir * 0.01);
  return { id: `fx-sub-${i}`, label: dir > 0 ? "Inner circle" : "Outer circle", ...p, h: FLAT_GROUND_M, heading_deg: bearing(p, q), speed_ms: 5.7 };
};

const feature = (v: { id: string; label: string; lon: number; lat: number; h: number; heading_deg: number; speed_ms: number }, kind: VKind, ms: number): VehicleFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [v.lon, v.lat, v.h] },
  properties: { id: v.id, kind, label: v.label, mode: "simulated" satisfies Mode, heading_deg: v.heading_deg, speed_ms: v.speed_ms, t: iso(ms) },
});

export function fixtureVehicles(kind: VKind | undefined, ms: number): VehicleCollection {
  const features: VehicleFeature[] = [];
  if (kind !== "subway") SLOTS.forEach((_, s) => { const a = aircraftAt(s, ms); if (a) features.push(feature(a, "aircraft", ms)); });
  if (kind !== "aircraft") for (let i = 0; i < TRAINS; i++) features.push(feature(subwayAt(i, ms), "subway", ms));
  return { type: "FeatureCollection", features };
}

/** One track per approach that overlaps the window, sampled every 15 s. */
export function fixtureTracks(fromMs: number, toMs: number): Tracks {
  const out: Tracks = {};
  const step = 15000;
  for (let s = 0; s < SLOTS.length; s++) {
    for (let t = Math.ceil(fromMs / step) * step; t <= toMs; t += step) {
      const a = aircraftAt(s, t);
      if (a) (out[a.id] ??= []).push([t / 1000, a.lon, a.lat, a.h] satisfies Sample);
    }
  }
  return out;
}
