import { describe, expect, it } from "vitest";
import { DECILE_COLORS, NO_DATA, isUnreliable, zoneColor, type ZoneProps } from "./zones";

const z = (o: Partial<ZoneProps>): ZoneProps => ({ dz22: "S0", name: "n", pop_2024: 1, area_km2: 1, pop_density_km2: 3000, simd_rank: 1, simd_decile: 1, simd_dominant_share: 1, ...o });

describe("data zones", () => {
  it("colours SIMD by decile, darkest is most deprived", () => {
    expect(zoneColor("simd", z({ simd_decile: 1 }))).toBe(DECILE_COLORS[0]);
    expect(zoneColor("simd", z({ simd_decile: 10 }))).toBe(DECILE_COLORS[9]);
    expect(zoneColor("simd", z({ simd_decile: null }))).toBe(NO_DATA);
  });
  it("bins population density", () => {
    expect(zoneColor("density", z({ pop_density_km2: 100 }))).not.toBe(zoneColor("density", z({ pop_density_km2: 20000 })));
    expect(zoneColor("density", z({ pop_density_km2: null }))).toBe(NO_DATA);
  });
  it("marks mixed 2011 to 2022 lookups as unreliable below 0.8", () => {
    expect(isUnreliable(z({ simd_dominant_share: 0.79 }))).toBe(true);
    expect(isUnreliable(z({ simd_dominant_share: 0.8 }))).toBe(false);
    expect(isUnreliable(z({ simd_dominant_share: null }))).toBe(true);
  });
});
