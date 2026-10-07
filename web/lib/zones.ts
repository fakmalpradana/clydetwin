// SPDX-License-Identifier: AGPL-3.0-or-later
// Data Zone (2022) choropleth: SIMD decile or population density. Properties come from analytics/v1/data_zones.geojson.
const R2 = "https://pub-7ceb47f944ac4ddb9bac87b602eb42af.r2.dev";
export const DATAZONES_URL = process.env.NEXT_PUBLIC_DATAZONES_URL ?? `${R2}/analytics/v1/data_zones.geojson`;

export interface ZoneProps {
  dz22: string;
  name: string;
  pop_2024: number | null;
  area_km2: number;
  pop_density_km2: number | null;
  simd_rank: number | null;
  simd_decile: number | null; // 1 = most deprived
  simd_dominant_share: number | null; // share of the zone area from its dominant 2011 Data Zone
}
export type ZoneMode = "simd" | "density";

/** Below this the 2011 to 2022 SIMD carry-over mixes several old zones: drawn hatched, treat as indicative. */
export const MIN_DOMINANT_SHARE = 0.8;
export const NO_DATA = "#8a8f98";

/** Viridis in 10 steps; decile 1 (most deprived) is darkest. */
export const DECILE_COLORS = ["#440154", "#482173", "#433e85", "#38588c", "#2d708e", "#25858e", "#1e9b8a", "#2ab07f", "#52c569", "#86d549"];
/** Upper bounds (people per km2) and magma-ish colours; last is open-ended. */
export const DENSITY_BINS: [number, string][] = [
  [2000, "#fcfdbf"],
  [4000, "#fec287"],
  [6000, "#fb8861"],
  [9000, "#e75263"],
  [14000, "#b73779"],
  [Infinity, "#51127c"],
];

export const isUnreliable = (p: Pick<ZoneProps, "simd_dominant_share">) =>
  p.simd_dominant_share === null || p.simd_dominant_share < MIN_DOMINANT_SHARE;

export function zoneColor(mode: ZoneMode, p: ZoneProps): string {
  if (mode === "simd") return p.simd_decile === null ? NO_DATA : DECILE_COLORS[p.simd_decile - 1] ?? NO_DATA;
  return p.pop_density_km2 === null ? NO_DATA : DENSITY_BINS.find(([max]) => p.pop_density_km2! < max)![1];
}

export const densityLabels = () =>
  DENSITY_BINS.map(([max], i) => (max === Infinity ? `${DENSITY_BINS[i - 1][0] / 1000}k+` : i === 0 ? `<${max / 1000}k` : `${DENSITY_BINS[i - 1][0] / 1000}-${max / 1000}k`));
