// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure data -> effect mappings for /immersive (weather from /now). Inputs are the /now.weather fields.

export interface WeatherFx {
  cloud_low: number; // % (0-100)
  cloud_mid: number;
  cloud_high: number;
  precip_mm: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

export interface CloudLayerParams {
  channel: "r" | "g" | "b";
  altitude: number; // m above the ellipsoid
  height: number; // m
  densityScale: number;
  weatherExponent: number;
}
export interface CloudParams {
  coverage: number; // global, 0-1
  layers: CloudLayerParams[];
}

// Low, mid and high deck of the three default takram layers (altitudes of the stock layers, high deck thin).
const DECKS = [
  { key: "cloud_low", channel: "r", altitude: 750, height: 650, density: 0.2 },
  { key: "cloud_mid", channel: "g", altitude: 2500, height: 1000, density: 0.15 },
  { key: "cloud_high", channel: "b", altitude: 7500, height: 500, density: 0.003 },
] as const;

/**
 * Cloud layers from the three cover fractions. takram has one global `coverage`, so it follows the cloudiest deck;
 * a sparser deck is thinned relative to it through `weatherExponent` (higher = patchier), and a deck at 0 % is off.
 */
export function cloudParams(w: Pick<WeatherFx, "cloud_low" | "cloud_mid" | "cloud_high">): CloudParams {
  const c = DECKS.map((d) => clamp01(w[d.key] / 100));
  const top = Math.max(...c);
  return {
    coverage: 0.1 + 0.6 * top,
    layers: DECKS.map((d, i) => ({
      channel: d.channel,
      altitude: d.altitude,
      height: d.height,
      densityScale: c[i] < 0.02 ? 0 : d.density,
      weatherExponent: top > 0 ? 1 + 3 * (1 - c[i] / top) : 1,
    })),
  };
}

/** Debug override `?wx=low,mid,high,precip` (cover in %, precipitation in mm/h), for forcing clouds and rain in tests. */
export function parseWxOverride(v: string | null): WeatherFx | null {
  if (!v) return null;
  const n = v.split(",").map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  return { cloud_low: n[0], cloud_mid: n[1], cloud_high: n[2], precip_mm: n[3] };
}
