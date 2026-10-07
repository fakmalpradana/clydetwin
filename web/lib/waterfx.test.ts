// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { flowAt, rippleParams, skyTint, sunGlint } from "./waterfx";

describe("rippleParams", () => {
  it("wind speeds up and strengthens ripples, bounded", () => {
    expect(rippleParams(10, 0).speed).toBeGreaterThan(rippleParams(2, 0).speed);
    expect(rippleParams(10, 0).strength).toBeGreaterThan(rippleParams(2, 0).strength);
    expect(rippleParams(500, 0).speed).toBeCloseTo(0.6 + 0.08 * 25);
    expect(rippleParams(NaN, 0).speed).toBeCloseTo(0.6);
  });
  it("rain adds fine ripples, none when dry", () => {
    expect(rippleParams(3, 0).fine).toBe(0);
    expect(rippleParams(3, 0.1).fine).toBe(0);
    expect(rippleParams(3, 5).fine).toBe(1);
  });
});

describe("skyTint and sunGlint", () => {
  const lum = (c: number[]) => c[0] + c[1] + c[2];
  it("is dark at night, bright by day", () => {
    expect(lum(skyTint(-20, 0))).toBeLessThan(0.05);
    expect(lum(skyTint(40, 0))).toBeGreaterThan(0.5);
  });
  it("dusk is warmer than noon, overcast is greyer than clear", () => {
    const dusk = skyTint(6, 0), noon = skyTint(45, 0);
    expect(dusk[0] / dusk[2]).toBeGreaterThan(noon[0] / noon[2]);
    const grey = skyTint(45, 100);
    expect(grey[2] - grey[0]).toBeLessThan(noon[2] - noon[0]);
  });
  it("sun glint is off below the horizon and under heavy cloud", () => {
    expect(sunGlint(-3, 0)).toEqual([0, 0, 0]);
    expect(lum(sunGlint(40, 100))).toBeLessThan(lum(sunGlint(40, 0)) * 0.2);
  });
});

describe("flowAt", () => {
  it("is a unit vector pointing downstream (westward) along the whole reach", () => {
    for (const [lon, lat] of [[-4.25, 55.8534], [-4.285, 55.858], [-4.33, 55.8676], [-4.39, 55.8887]]) {
      const [e, n] = flowAt(lon, lat);
      expect(Math.hypot(e, n)).toBeCloseTo(1);
      expect(e).toBeLessThan(-0.3);
    }
  });
  it("follows the river's bend north-west at the lower reach", () => {
    expect(flowAt(-4.375, 55.884)[1]).toBeGreaterThan(0.3);
  });
});
