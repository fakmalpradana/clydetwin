// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { approxView, availableBasemaps, getBasemap, googleTileUrl, parseBasemap } from "./basemap";

describe("basemaps", () => {
  it("defaults to the dark basemap and rejects unknown or gated ids", () => {
    expect(parseBasemap("")).toBe("dark");
    expect(parseBasemap("bm=esri")).toBe("esri");
    expect(parseBasemap("bm=nonsense")).toBe("dark");
    // no key in the test env: Google options are hidden and cannot be selected via the URL
    expect(availableBasemaps().some((b) => b.google)).toBe(false);
    expect(parseBasemap("bm=google-sat")).toBe("dark");
  });

  it("carries the required attributions", () => {
    expect(getBasemap("esri").attribution).toBe("Esri, Maxar, Earthstar Geographics, and the GIS User Community");
    expect(getBasemap("dark").attribution).toMatch(/Esri, HERE, Garmin.*OpenStreetMap/);
    expect(getBasemap("dark").url).not.toMatch(/cartocdn/);
    expect(getBasemap("osm").attribution).toMatch(/OpenStreetMap/);
  });

  it("only uses the official Google tile host", () => {
    expect(googleTileUrl("S")).toMatch(/^https:\/\/tile\.googleapis\.com\/v1\/2dtiles\/\{z\}\/\{x\}\/\{y\}\?session=S&key=/);
  });

  it("derives a plausible zoom and bounds", () => {
    const v = approxView({ lon: -4.25, lat: 55.86, height: 400, heading: 0, pitch: -90 });
    expect(v.zoom).toBeGreaterThan(14);
    expect(v.zoom).toBeLessThan(20);
    expect(v.north).toBeGreaterThan(v.south);
    expect(v.east).toBeGreaterThan(v.west);
  });
});
