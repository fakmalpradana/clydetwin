// SPDX-License-Identifier: AGPL-3.0-or-later
// Typed client for the Phase 2 API contract (docs/phases/P2.md). With NEXT_PUBLIC_API_URL unset it serves
// the sample data in lib/fixtures, re-based to "now" so the UI can be previewed without the backend.

export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
/** True when no backend is configured: every number shown is sample data and the UI must say so. */
export const FIXTURE = !API_URL;

export type Kind = "river_level" | "rainfall" | "weather" | "air_quality";
export type Status = "normal" | "high" | "alert" | "stale" | "unknown";

export interface Station {
  id: string;
  source: string;
  kind: Kind;
  name: string;
  unit: string;
  latest: { t: string; value: number } | null;
  status: Status;
}
export interface StationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Station;
}
export interface Stations { type: "FeatureCollection"; features: StationFeature[] }
export interface Timeseries { id: string; unit: string; points: [string, number][] }
export interface Now {
  weather: { temp_c: number; wind_ms: number; precip_mm: number; cloud_low: number; cloud_mid: number; cloud_high: number; t: string };
  rivers: { id: string; name: string; value: number; unit: string; status: Status; t: string }[];
  air: { id: string; name: string; pm25: number; no2: number; t: string }[];
}
export interface Health {
  status: string;
  db: string;
  sources: Record<string, { last_ok: string; age_s: number; stale: boolean }>;
}

/** Expected update interval per kind, in seconds. Open-Meteo and SAQD are hourly, SEPA is 15-minute. */
export const INTERVAL_S: Record<Kind, number> = { river_level: 900, rainfall: 900, weather: 3600, air_quality: 3600 };

export const ageSeconds = (t: string, now = Date.now()) => Math.max(0, (now - Date.parse(t)) / 1000);

/** Stale = older than twice the expected interval (or no timestamp at all). */
export const isStale = (t: string | null | undefined, kind: Kind, now = Date.now()) =>
  !t || Number.isNaN(Date.parse(t)) || ageSeconds(t, now) > 2 * INTERVAL_S[kind];

/** The status to show: the API's own, overridden to "stale" when the reading is too old. */
export function effectiveStatus(s: Pick<Station, "kind" | "status" | "latest">, now = Date.now()): Status {
  if (!s.latest) return "unknown";
  return isStale(s.latest.t, s.kind, now) ? "stale" : s.status;
}

export const ageLabel = (t: string, now = Date.now()) => {
  const m = Math.round(ageSeconds(t, now) / 60);
  return m < 1 ? "just now" : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Fixture timestamps are relative to this instant; they are shifted so the newest reading is ~now. */
export const FIXTURE_REF = Date.parse("2026-01-01T12:00:00Z");
export function rebase<T>(data: T, now = Date.now()): T {
  const shift = Math.floor(now / 900000) * 900000 - FIXTURE_REF;
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
  return JSON.parse(JSON.stringify(data), (_, v) =>
    typeof v === "string" && iso.test(v) ? new Date(Date.parse(v) + shift).toISOString() : v,
  );
}

async function get<T>(path: string, fixture: () => Promise<T>): Promise<T> {
  if (FIXTURE) return rebase(await fixture());
  const r = await fetch(`${API_URL}/api/v1${path}`);
  if (!r.ok) throw new Error(`API ${path}: ${r.status}`);
  return r.json();
}

export const getStations = () => get<Stations>("/stations", async () => (await import("./fixtures/stations.json")).default as Stations);
export const getNow = () => get<Now>("/now", async () => (await import("./fixtures/now.json")).default as Now);
export const getHealth = () => get<Health>("/health", async () => (await import("./fixtures/health.json")).default as Health);
export const getTimeseries = (id: string, hours = 24) =>
  get<Timeseries>(`/timeseries/${encodeURIComponent(id)}?hours=${Math.min(hours, 168)}`, async () => {
    const all = (await import("./fixtures/timeseries.json")).default as unknown as Record<string, Timeseries>;
    if (!all[id]) throw new Error(`no fixture for ${id}`);
    return all[id];
  });
