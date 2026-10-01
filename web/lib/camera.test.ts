// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMERA, cameraQuery, hasCameraParams, paramsToCamera, withCamera, carry, setParam } from "./camera";

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

  it("withCamera keeps unrelated params", () => {
    const out = new URLSearchParams(withCamera("?t=2026-10-01T11:00:00Z&force=1&lon=0", DEFAULT_CAMERA));
    expect(out.get("force")).toBe("1");
    expect(out.get("t")).toBe("2026-10-01T11:00:00Z");
    expect(paramsToCamera(out)).toEqual(DEFAULT_CAMERA);
  });

  it("carry keeps only t and bm", () => {
    expect(carry("?lon=1&t=2026-10-01T11%3A00%3A00Z&bm=esri&force=1")).toBe("&t=2026-10-01T11%3A00%3A00Z&bm=esri");
    expect(carry("?lon=1")).toBe("");
    expect(setParam("?a=1&bm=dark", "bm", "osm")).toBe("?a=1&bm=osm");
  });
});
