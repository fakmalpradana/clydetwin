// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { followPose, LANDMARKS, legStart, shiftedDate, TOUR_S, tourPose } from "./camera-modes";

const dist = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * 62500, (a.lat - b.lat) * 111200);

describe("tourPose", () => {
  it("is a closed loop", () => {
    const a = tourPose(0), b = tourPose(TOUR_S);
    expect(dist(a, b)).toBeLessThan(1e-6);
    expect(b.heading).toBeCloseTo(a.heading);
  });
  it("looks at each landmark when it reaches its waypoint (heading points at it, camera 400 m away)", () => {
    LANDMARKS.forEach((l, i) => {
      const p = tourPose(legStart(i));
      expect(dist(p, l)).toBeCloseTo(400, 0);
      const toward = (Math.atan2((l.lon - p.lon) * 62500, (l.lat - p.lat) * 111200) * 180) / Math.PI;
      expect(((p.heading - toward + 540) % 360) - 180).toBeCloseTo(0, 0);
      expect(p.pitch).toBeLessThan(0);
    });
  });
  it("moves smoothly (no jump between samples)", () => {
    for (let t = 0; t < TOUR_S; t += 0.5) expect(dist(tourPose(t), tourPose(t + 0.5))).toBeLessThan(100);
  });
});

describe("followPose", () => {
  it("sits behind and above the vehicle, looking down at it", () => {
    const v = { lon: -4.25, lat: 55.86, h: 200 };
    const p = followPose(v, 90); // flying east: camera is west of it
    expect(p.lon).toBeLessThan(v.lon);
    expect(p.height).toBeCloseTo(320);
    expect(p.heading).toBeCloseTo(90, 0);
    expect(p.pitch).toBeLessThan(0);
  });
  it("copes with an unknown heading", () => {
    expect(Number.isFinite(followPose({ lon: -4.25, lat: 55.86, h: 0 }, null).heading)).toBe(true);
  });
});

describe("shiftedDate", () => {
  it("shifts by hours and clamps to +-12 h", () => {
    const d = new Date("2026-06-01T12:00:00Z");
    expect(shiftedDate(d, 3).toISOString()).toBe("2026-06-01T15:00:00.000Z");
    expect(shiftedDate(d, -40).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});
