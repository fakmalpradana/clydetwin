// SPDX-License-Identifier: AGPL-3.0-or-later
// Mobility client for the Phase 3 contract (docs/phases/P3.md): /vehicles, /tracks and client-side motion,
// shared by /explore and /immersive. With NEXT_PUBLIC_API_URL unset it serves a generated sample (lib/vehicles-fixture.ts).
import { API_URL, FIXTURE } from "./api";
import { bearing, offset } from "./vehicle-geo";
import { fixtureTracks, fixtureVehicles, subwayTracks } from "./vehicles-fixture";

export { bearing, offset };

export type VKind = "aircraft" | "subway";
/** Honest provenance: observed now, from a timetable, or computed. */
export type Mode = "live" | "scheduled" | "simulated";
export interface Vehicle {
  id: string;
  kind: VKind;
  label: string;
  mode: Mode;
  /** Null when unknown (e.g. a taxiing aircraft). */
  heading_deg: number | null;
  speed_ms: number | null;
  /** Sample time, epoch ms. */
  t: number;
  lon: number;
  lat: number;
  /** Ellipsoidal height, m. */
  h: number;
}
/** Contract feature: Point [lon, lat, h_ellipsoid_m] with the properties below. */
export interface VehicleFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number, number] };
  properties: { id: string; kind: VKind; label: string; mode: Mode; heading_deg: number | null; speed_ms: number | null; t: string };
}
export interface VehicleCollection { type: "FeatureCollection"; features: VehicleFeature[] }
/** A track sample: [t, lon, lat, h]. t is epoch seconds or ms (numbers) or an ISO string. */
export type Sample = [number | string, number, number, number];
export type Tracks = Record<string, Sample[]>;

export const MODE_LABEL: Record<Mode, string> = { live: "live", scheduled: "scheduled", simulated: "simulated" };
export const MODE_COLOR: Record<Mode, string> = { live: "#4ade80", scheduled: "#38bdf8", simulated: "#fbbf24" };

/** Epoch ms from a track timestamp: ISO string, epoch seconds or epoch ms. */
export const toMs = (t: number | string) => (typeof t === "string" ? Date.parse(t) : t < 1e11 ? t * 1000 : t);

export function parseVehicles(fc: VehicleCollection): Vehicle[] {
  return fc.features.flatMap((f) => {
    const p = f.properties, [lon, lat, h] = f.geometry.coordinates;
    const t = Date.parse(p.t);
    return Number.isNaN(t) || ![lon, lat, h].every(Number.isFinite)
      ? []
      : [{ id: p.id, kind: p.kind, label: p.label, mode: p.mode, heading_deg: p.heading_deg ?? null, speed_ms: p.speed_ms ?? null, t, lon, lat, h }];
  });
}

/** Longest time a sample is dead-reckoned past its timestamp; beyond that the vehicle holds still. */
export const MAX_EXTRAPOLATE_S = 30;

/** Position of a vehicle at `atMs`, dead-reckoned from its last sample along heading and speed (height held). */
export function project(v: Vehicle, atMs: number): { lon: number; lat: number; h: number } {
  const dt = Math.min(Math.max((atMs - v.t) / 1000, 0), MAX_EXTRAPOLATE_S);
  const p = dt && v.speed_ms && v.heading_deg != null ? offset(v.lon, v.lat, v.heading_deg, v.speed_ms * dt) : v;
  return { lon: p.lon, lat: p.lat, h: v.h };
}

/** Linear interpolation of a track at `atMs`; null outside its time span. Heading is the bearing of the bracketing segment. */
export function interpolate(track: Sample[], atMs: number): { lon: number; lat: number; h: number; heading_deg: number } | null {
  if (track.length < 2) return null;
  const ts = track.map((s) => toMs(s[0]));
  if (atMs < ts[0] || atMs > ts[ts.length - 1]) return null;
  let i = 1;
  while (i < ts.length - 1 && ts[i] < atMs) i++;
  const [a, b] = [track[i - 1], track[i]], span = ts[i] - ts[i - 1], f = span > 0 ? (atMs - ts[i - 1]) / span : 0;
  const A = { lon: a[1], lat: a[2] }, B = { lon: b[1], lat: b[2] };
  return { lon: A.lon + (B.lon - A.lon) * f, lat: A.lat + (B.lat - A.lat) * f, h: a[3] + (b[3] - a[3]) * f, heading_deg: bearing(A, B) };
}

async function get<T>(path: string, fixture: () => T): Promise<T> {
  if (FIXTURE) return fixture();
  const r = await fetch(`${API_URL}/api/v1${path}`);
  if (!r.ok) throw new Error(`API ${path}: ${r.status}`);
  return r.json();
}

export const getVehicles = async (kind?: VKind, at?: Date): Promise<Vehicle[]> =>
  parseVehicles(await get<VehicleCollection>(`/vehicles?${kind ? `kind=${kind}&` : ""}${at ? `at=${at.toISOString()}` : ""}`, () => fixtureVehicles(kind, at?.getTime() ?? Date.now())));

/** Aircraft tracks for the time slider; the API caps the window at 24 h. */
export const getTracks = (from: Date, to: Date, kind: VKind = "aircraft"): Promise<Tracks> =>
  get<Tracks>(`/tracks?kind=${kind}&from=${from.toISOString()}&to=${to.toISOString()}`, () => (kind === "aircraft" ? fixtureTracks(from.getTime(), to.getTime()) : subwayTracks(from.getTime(), to.getTime()).tracks));

/** Subway tracks carry no label: derive it from the id (`subway:inner:...` from the API, `fx-sub-N` in fixtures). */
export const isSubwayId = (id: string) => id.startsWith("subway:") || id.startsWith("fx-sub-");
export const subwayLabel = (id: string) => (id.startsWith("subway:") ? `${id.split(":")[1] === "outer" ? "Outer" : "Inner"} circle` : subwayTracks(0, 0).labels[id] ?? "Subway");

/** SSE URL for live updates, or null in fixture mode (poll instead). */
export const STREAM_URL = FIXTURE ? null : `${API_URL}/api/v1/stream/vehicles`;
