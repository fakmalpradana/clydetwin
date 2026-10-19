// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { facadeParams, nightFactor } from "./facade";

describe("facadeParams", () => {
  it("uses the tile storeys, else height / 3 m, never below 1", () => {
    expect(facadeParams({ storeys_est: 5, height: 99 }).storeys).toBe(5);
    expect(facadeParams({ storeys_est: -1, height: 14 }).storeys).toBe(5);
    expect(facadeParams({ height: 1 }).storeys).toBe(1);
    expect(facadeParams({}).storeys).toBe(1);
  });
  it("sandstone for listed, partly for conservation areas, neutral otherwise (sentinels are not listings)", () => {
    expect(facadeParams({ lb_category: "B" }).sandstone).toBe(1);
    expect(facadeParams({ lb_category: "none", conservation_area: 1 }).sandstone).toBe(0.6);
    expect(facadeParams({ lb_category: "none", conservation_area: 0 }).sandstone).toBe(0);
    expect(facadeParams({ lb_category: "none", conservation_area: -1 }).sandstone).toBe(0);
  });
});

describe("nightFactor", () => {
  it("is 0 in daylight, 1 well after sunset, and ramps in between", () => {
    expect(nightFactor(30)).toBe(0);
    expect(nightFactor(-10)).toBe(1);
    expect(nightFactor(-2)).toBeCloseTo(0.5);
  });
});
