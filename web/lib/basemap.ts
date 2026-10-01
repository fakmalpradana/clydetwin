// SPDX-License-Identifier: AGPL-3.0-or-later
// Basemap catalogue shared by /explore (Cesium imagery layers) and /immersive (3d-tiles-renderer image overlays).
import type { CameraState } from "./camera";

export type BasemapId = "dark" | "light" | "esri" | "osm" | "google-road" | "google-sat";

export interface Basemap {
  id: BasemapId;
  label: string;
  /** XYZ template; `{s}` is replaced by a subdomain. Google entries are resolved through a session instead. */
  url: string;
  subdomains?: string[];
  maxLevel: number;
  /** HTML attribution (Google's comes live from the viewport endpoint). */
  attribution: string;
  google?: "roadmap" | "satellite";
}

export const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const CARTO = '&copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

export const BASEMAPS: Basemap[] = [
  { id: "dark", label: "Carto Dark Matter", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", subdomains: ["a", "b", "c", "d"], maxLevel: 19, attribution: `${OSM} ${CARTO}` },
  { id: "light", label: "Carto Positron", url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", subdomains: ["a", "b", "c", "d"], maxLevel: 19, attribution: `${OSM} ${CARTO}` },
  { id: "esri", label: "Esri World Imagery", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maxLevel: 19, attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community" },
  { id: "osm", label: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxLevel: 19, attribution: OSM },
  { id: "google-road", label: "Google roadmap", url: "", maxLevel: 22, attribution: "", google: "roadmap" },
  { id: "google-sat", label: "Google satellite", url: "", maxLevel: 22, attribution: "", google: "satellite" },
];

export const DEFAULT_BASEMAP: BasemapId = "dark";

/** Google options only exist when a Map Tiles API key is configured. */
export const availableBasemaps = (): Basemap[] => BASEMAPS.filter((b) => !b.google || GOOGLE_KEY);

export const getBasemap = (id: BasemapId): Basemap => BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];

export function parseBasemap(params: URLSearchParams | string, fallback: BasemapId = DEFAULT_BASEMAP): BasemapId {
  const q = typeof params === "string" ? new URLSearchParams(params) : params;
  const id = q.get("bm");
  return availableBasemaps().some((b) => b.id === id) ? (id as BasemapId) : fallback;
}

// --- Google Map Tiles API (official 2D tiles only: createSession, then tiles with session + key) ---

const sessions = new Map<string, Promise<string>>();

/** One session per map type. https://developers.google.com/maps/documentation/tile/2d-tiles-overview */
export function createGoogleSession(mapType: "roadmap" | "satellite"): Promise<string> {
  let s = sessions.get(mapType);
  if (!s) {
    s = fetch(`https://tile.googleapis.com/v1/createSession?key=${GOOGLE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapType, language: "en-GB", region: "GB" }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Google createSession failed: ${r.status}`);
      return (await r.json()).session as string;
    });
    s.catch(() => sessions.delete(mapType));
    sessions.set(mapType, s);
  }
  return s;
}

export const googleTileUrl = (session: string) =>
  `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${GOOGLE_KEY}`;

/** Rough web-mercator zoom and bounding box for a top-down-ish view (only used to ask Google for copyright text). */
export function approxView(c: CameraState) {
  const half = Math.max(50, c.height) * 0.58; // half the ground width for a ~60 degree field of view
  const dLat = (half / 111320) * 0.75;
  const dLon = half / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const zoom = Math.max(0, Math.min(22, Math.round(Math.log2((156543.03 * Math.cos((c.lat * Math.PI) / 180)) / ((half * 2) / 1000)))));
  return { zoom, north: c.lat + dLat, south: c.lat - dLat, east: c.lon + dLon, west: c.lon - dLon };
}

/** Copyright text for the current view, required next to Google tiles. */
export async function fetchGoogleCopyright(session: string, c: CameraState): Promise<string> {
  const v = approxView(c);
  const u = new URL("https://tile.googleapis.com/tile/v1/viewport");
  u.search = new URLSearchParams({ session, key: GOOGLE_KEY, zoom: String(v.zoom), north: String(v.north), south: String(v.south), east: String(v.east), west: String(v.west) }).toString();
  const r = await fetch(u);
  return r.ok ? ((await r.json()).copyright as string) ?? "" : "";
}

/** Resolve a basemap to a concrete XYZ template (Google needs a session first). */
export async function resolveTemplate(b: Basemap): Promise<{ url: string; subdomains?: string[] }> {
  if (b.google) return { url: googleTileUrl(await createGoogleSession(b.google)) };
  return { url: b.url, subdomains: b.subdomains };
}
