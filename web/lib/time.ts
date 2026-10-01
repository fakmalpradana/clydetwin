// SPDX-License-Identifier: AGPL-3.0-or-later
import { GEORGE_SQUARE } from "./tileset";

/** Scene time for sun lighting: real "now" unless `?t=<ISO 8601>` overrides it (handy for demos and tests). */
export function sceneDate(params: URLSearchParams): Date {
  const t = params.get("t");
  const d = t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

/** Solar elevation in degrees (NOAA low-precision formulas; good to a fraction of a degree). */
export function sunElevation(date: Date, lat = GEORGE_SQUARE.lat, lon = GEORGE_SQUARE.lon): number {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = (((gmst * 15 + lon) * rad - ra) % (2 * Math.PI));
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
}

/**
 * Time to show when the real sun is down: the same day, in the afternoon, when the sun is about 12 degrees up
 * (golden-hour-ish), or at solar noon if it never gets that low. Purely illustrative; the UI must say so.
 */
export function illustrativeDate(now: Date): Date {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best = new Date(day + 12 * 3600000);
  for (let m = 12 * 60; m < 22 * 60; m += 5) {
    const d = new Date(day + m * 60000);
    best = d;
    if (sunElevation(d) <= 12) break;
  }
  return best;
}

/** Real time, unless the URL sets `t` or (when allowed) it is night in Glasgow, in which case an illustrative daytime is used. */
export function sceneTime(params: URLSearchParams, illustrativeAtNight = false): { date: Date; illustrative: boolean } {
  const date = sceneDate(params);
  if (illustrativeAtNight && !params.get("t") && sunElevation(date) < 2) {
    return { date: illustrativeDate(date), illustrative: true };
  }
  return { date, illustrative: false };
}
