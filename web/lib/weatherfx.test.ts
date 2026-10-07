// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { cloudParams, parseWxOverride } from "./weatherfx";

describe("cloudParams", () => {
  it("clear sky switches every deck off", () => {
    const p = cloudParams({ cloud_low: 0, cloud_mid: 0, cloud_high: 0 });
    expect(p.layers.every((l) => l.densityScale === 0)).toBe(true);
    expect(p.coverage).toBeCloseTo(0.1);
  });
  it("coverage follows the cloudiest deck and is bounded", () => {
    expect(cloudParams({ cloud_low: 35, cloud_mid: 20, cloud_high: 60 }).coverage).toBeCloseTo(0.46);
    expect(cloudParams({ cloud_low: 500, cloud_mid: -3, cloud_high: NaN }).coverage).toBeCloseTo(0.7);
  });
  it("a sparser deck gets a higher weather exponent than the cloudiest one", () => {
    const [low, mid, high] = cloudParams({ cloud_low: 35, cloud_mid: 20, cloud_high: 60 }).layers;
    expect(high.weatherExponent).toBe(1);
    expect(low.weatherExponent).toBeGreaterThan(1);
    expect(mid.weatherExponent).toBeGreaterThan(low.weatherExponent);
  });
});

describe("parseWxOverride", () => {
  it("parses four numbers, rejects the rest", () => {
    expect(parseWxOverride("100,80,60,4")).toEqual({ cloud_low: 100, cloud_mid: 80, cloud_high: 60, precip_mm: 4 });
    expect(parseWxOverride("1,2,3")).toBeNull();
    expect(parseWxOverride("a,b,c,d")).toBeNull();
    expect(parseWxOverride(null)).toBeNull();
  });
});
