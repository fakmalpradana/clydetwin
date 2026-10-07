// SPDX-License-Identifier: AGPL-3.0-or-later
// Quality presets for /immersive: detect-gpu tier -> preset, overridable with ?q=low|medium|high.

export type Quality = "low" | "medium" | "high";
export interface QualitySettings {
  dpr: [number, number];
  shadowMap: number;
  clouds: false | "medium" | "high"; // false = off
  smaa: boolean; // post-processing antialiasing
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: { dpr: [1, 1], shadowMap: 1024, clouds: false, smaa: false },
  medium: { dpr: [1, 1.25], shadowMap: 2048, clouds: "medium", smaa: false },
  high: { dpr: [1, 2], shadowMap: 4096, clouds: "high", smaa: true },
};

export const isQuality = (v: string | null | undefined): v is Quality => v === "low" || v === "medium" || v === "high";

/** `?q=` wins; else tier 3+ is high, tier 2 medium, anything lower low. An unknown tier (GPU check skipped) is medium. */
export function selectQuality(q: string | null | undefined, tier: number | null): Quality {
  if (isQuality(q)) return q;
  if (tier == null) return "medium";
  return tier >= 3 ? "high" : tier >= 2 ? "medium" : "low";
}
