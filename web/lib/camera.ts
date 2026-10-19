// SPDX-License-Identifier: AGPL-3.0-or-later
// Camera state <-> query string, shared by /explore (Cesium) and /immersive (three.js).
// Conventions (Cesium's): lon/lat in degrees, height = metres above the ELLIPSOID,
// heading = degrees clockwise from north, pitch = degrees (0 = horizon, -90 = straight down).

export interface CameraState {
  lon: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
}

export const DEFAULT_CAMERA: CameraState = {
  lon: -4.2548,
  lat: 55.8551,
  height: 380,
  heading: 25,
  pitch: -28,
};

/** /scenarios/flood: the Clyde through Glasgow Green and the Broomielaw, looking west along the river. */
export const FLOOD_CAMERA: CameraState = { lon: -4.2290, lat: 55.8440, height: 1100, heading: 280, pitch: -35 };

const KEYS = ["lon", "lat", "h", "hd", "p"] as const;

const round = (v: number, d: number) => Number(v.toFixed(d));

const wrapHeading = (h: number) => ((h % 360) + 360) % 360;

export function cameraToParams(c: CameraState): URLSearchParams {
  return new URLSearchParams({
    lon: String(round(c.lon, 6)),
    lat: String(round(c.lat, 6)),
    h: String(round(c.height, 1)),
    hd: String(round(wrapHeading(c.heading), 1)),
    p: String(round(c.pitch, 1)),
  });
}

/** Parse; missing or invalid values fall back to `fallback` per field. */
export function paramsToCamera(
  params: URLSearchParams | string,
  fallback: CameraState = DEFAULT_CAMERA,
): CameraState {
  const q = typeof params === "string" ? new URLSearchParams(params) : params;
  const num = (k: string, d: number) => {
    const raw = q.get(k);
    const v = raw === null || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(v) ? v : d;
  };
  const lat = Math.min(90, Math.max(-90, num("lat", fallback.lat)));
  return {
    lon: num("lon", fallback.lon),
    lat,
    height: Math.max(0, num("h", fallback.height)),
    heading: wrapHeading(num("hd", fallback.heading)),
    pitch: Math.min(90, Math.max(-90, num("p", fallback.pitch))),
  };
}

/** Query string (no leading "?") carrying only the camera keys. */
export const cameraQuery = (c: CameraState) => cameraToParams(c).toString();

export const hasCameraParams = (params: URLSearchParams) => KEYS.every((k) => params.has(k));

/** `?search` with the camera keys replaced and every other param (t, force, gpu, ...) preserved. */
export function withCamera(search: string, c: CameraState): string {
  const q = new URLSearchParams(search);
  cameraToParams(c).forEach((v, k) => q.set(k, v));
  return `?${q.toString()}`;
}

/** Shared non-camera params carried across viewer switches: scene time `t` and basemap `bm`. Returns "" or "&t=..&bm=..". */
export function carry(search: string): string {
  const q = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of ["t", "bm"]) {
    const v = q.get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `&${s}` : "";
}

/** Replace/add one query param in the current URL without a navigation. */
export function setParam(search: string, key: string, value: string): string {
  const q = new URLSearchParams(search);
  q.set(key, value);
  return `?${q.toString()}`;
}

/** /immersive default: oblique view north over the city centre from the Clyde, horizon and sky in frame. */
export const IMMERSIVE_CAMERA: CameraState = { lon: -4.2575, lat: 55.8478, height: 240, heading: 12, pitch: -9 };
