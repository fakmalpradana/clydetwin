// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { StationFeature } from "./api";
import { buildWater, MAX_RISE_M, WATER_H, waterLevel } from "./water";

const st = (name: string, lon: number, value: number | null, t = new Date().toISOString()): StationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, 55.85] },
  properties: { id: name, source: "sepa", kind: "river_level", name, unit: "m", latest: value == null ? null : { t, value }, status: "normal" },
});

describe("waterLevel", () => {
  const dry = WATER_H;
  it("falls back to the constant without a Clyde gauge", () => {
    expect(waterLevel([])).toEqual({ h: dry, source: "constant" });
    expect(waterLevel([st("Kelvin @ Killermont", -4.3, 0.7)]).source).toBe("constant");
  });
  it("uses the Clyde gauge nearest George Square", () => {
    const w = waterLevel([st("Clyde @ Daldowie", -4.1, 1), st("Clyde @ Glasgow Weir", -4.24, 2.5)]);
    expect(w.source).toBe("gauge");
    expect(w.gauge).toBe("Clyde @ Glasgow Weir");
    expect(w.h).toBeCloseTo(dry + 0.5);
  });
  it("clamps the rise and ignores stale or empty readings", () => {
    expect(waterLevel([st("Clyde @ A", -4.25, 20)]).h).toBeCloseTo(dry + MAX_RISE_M);
    expect(waterLevel([st("Clyde @ A", -4.25, -20)]).h).toBeCloseTo(dry - MAX_RISE_M);
    expect(waterLevel([st("Clyde @ A", -4.25, 3, "2020-01-01T00:00:00Z")]).source).toBe("constant");
    expect(waterLevel([st("Clyde @ A", -4.25, null)]).source).toBe("constant");
  });
});

describe("buildWater", () => {
  const strip = { coordinates: [[[-4.3, 55.85], [-4.2, 55.85], [-4.2, 55.8505], [-4.3, 55.8505], [-4.3, 55.85]]] as [number, number][][] };
  it("splits long triangles to the edge limit and keeps the area", () => {
    const m = buildWater([strip], 250);
    const e = (a: number, b: number) => Math.hypot((m.xy[2 * a] - m.xy[2 * b]) * 62500, (m.xy[2 * a + 1] - m.xy[2 * b + 1]) * 111200);
    for (let i = 0; i < m.index.length; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) expect(e(m.index[i + a], m.index[i + b])).toBeLessThanOrEqual(250);
    let area = 0;
    for (let i = 0; i < m.index.length; i += 3) {
      const [a, b, c] = [m.index[i], m.index[i + 1], m.index[i + 2]].map((k) => [m.xy[2 * k] * 62500, m.xy[2 * k + 1] * 111200]);
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    expect(area).toBeCloseTo(0.1 * 62500 * 0.0005 * 111200, -3);
  });
});
