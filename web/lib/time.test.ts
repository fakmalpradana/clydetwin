// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { illustrativeDate, sceneTime, sunElevation } from "./time";

describe("sun", () => {
  it("matches solstice geometry in Glasgow", () => {
    expect(sunElevation(new Date("2026-06-21T12:00:00Z"))).toBeGreaterThan(56);
    expect(sunElevation(new Date("2026-06-21T12:00:00Z"))).toBeLessThan(59);
    expect(sunElevation(new Date("2026-12-21T12:00:00Z"))).toBeGreaterThan(9);
    expect(sunElevation(new Date("2026-12-21T12:00:00Z"))).toBeLessThan(12);
    expect(sunElevation(new Date("2026-10-01T00:00:00Z"))).toBeLessThan(0);
  });

  it("uses an illustrative afternoon time only at night and without t", () => {
    const night = new Date("2026-10-01T00:30:00Z");
    const d = illustrativeDate(night);
    expect(sunElevation(d)).toBeGreaterThan(0);
    expect(sunElevation(d)).toBeLessThan(15);
    const spy = (s: string) => new URLSearchParams(s);
    expect(sceneTime(spy("t=2026-10-01T00:30:00Z"), true).illustrative).toBe(false);
    expect(sceneTime(spy(""), false).illustrative).toBe(false);
  });
});
