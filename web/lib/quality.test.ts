// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { QUALITY, selectQuality } from "./quality";

describe("selectQuality", () => {
  it("maps detect-gpu tiers", () => {
    expect(selectQuality(null, 3)).toBe("high");
    expect(selectQuality(null, 2)).toBe("medium");
    expect(selectQuality(null, 1)).toBe("low");
    expect(selectQuality(null, 0)).toBe("low");
  });
  it("?q overrides the tier, junk is ignored", () => {
    expect(selectQuality("low", 3)).toBe("low");
    expect(selectQuality("high", 0)).toBe("high");
    expect(selectQuality("ultra", 2)).toBe("medium");
  });
  it("defaults to medium when the tier is unknown", () => expect(selectQuality(null, null)).toBe("medium"));
  it("presets are ordered by cost, clouds off in low", () => {
    expect(QUALITY.low.clouds).toBe(false);
    expect(QUALITY.low.shadowMap).toBeLessThan(QUALITY.medium.shadowMap);
    expect(QUALITY.medium.shadowMap).toBeLessThan(QUALITY.high.shadowMap);
    expect(QUALITY.low.dpr[1]).toBeLessThan(QUALITY.high.dpr[1]);
  });
});
