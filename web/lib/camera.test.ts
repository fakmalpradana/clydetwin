// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMERA, cameraQuery, hasCameraParams, paramsToCamera } from "./camera";

describe("camera <-> query string", () => {
  it("round-trips within the encoding precision", () => {
    const c = { lon: -4.250312345, lat: 55.861712345, height: 412.34, heading: 187.25, pitch: -33.33 };
    const back = paramsToCamera(cameraQuery(c));
    expect(back.lon).toBeCloseTo(c.lon, 6);
    expect(back.lat).toBeCloseTo(c.lat, 6);
    expect(back.height).toBeCloseTo(c.height, 1);
    expect(back.heading).toBeCloseTo(c.heading, 1);
    expect(back.pitch).toBeCloseTo(c.pitch, 1);
  });

  it("wraps negative headings and clamps pitch/lat", () => {
    const c = paramsToCamera("lon=1&lat=95&h=10&hd=-90&p=-120");
    expect(c.heading).toBe(270);
    expect(c.pitch).toBe(-90);
    expect(c.lat).toBe(90);
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(paramsToCamera("")).toEqual(DEFAULT_CAMERA);
    expect(paramsToCamera("lon=abc&h=")).toEqual(DEFAULT_CAMERA);
    expect(hasCameraParams(new URLSearchParams(cameraQuery(DEFAULT_CAMERA)))).toBe(true);
    expect(hasCameraParams(new URLSearchParams("lon=1"))).toBe(false);
  });
});
