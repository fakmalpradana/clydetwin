// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bearing, getTracks, getVehicles, interpolate, offset, parseVehicles, project, toMs, type Vehicle } from "./vehicles";
import { FLAT_GROUND_M } from "./tileset";
import { fixtureVehicles, subwayTracks } from "./vehicles-fixture";

const T0 = Date.parse("2026-03-01T12:00:00Z");
const v: Vehicle = { id: "a", kind: "aircraft", label: "X", mode: "live", heading_deg: 90, speed_ms: 100, t: T0, lon: -4.4, lat: 55.87, h: 500 };

describe("geometry", () => {
  it("offset and bearing agree", () => {
    const p = offset(-4.4, 55.87, 54, 5000);
    expect(bearing({ lon: -4.4, lat: 55.87 }, p)).toBeCloseTo(54, 0);
  });
});

describe("project (dead reckoning)", () => {
  it("moves east at speed*dt and holds height", () => {
    const p = project(v, T0 + 10_000); // 1 km east
    expect(p.lat).toBeCloseTo(55.87, 3);
    expect((p.lon + 4.4) * 111320 * Math.cos((55.87 * Math.PI) / 180)).toBeCloseTo(1000, -1);
    expect(p.h).toBe(500);
  });
  it("does not move backwards or beyond 30 s", () => {
    expect(project(v, T0 - 5000)).toMatchObject({ lon: v.lon, lat: v.lat });
    expect(project(v, T0 + 300_000).lon).toBeCloseTo(project(v, T0 + 30_000).lon, 9);
  });
});

describe("interpolate", () => {
  const tr: [number, number, number, number][] = [[T0 / 1000, -4.4, 55.87, 1000], [T0 / 1000 + 100, -4.4, 55.88, 900], [T0 / 1000 + 200, -4.3, 55.88, 800]];
  it("is linear within a segment, with the segment heading", () => {
    const m = interpolate(tr, T0 + 50_000)!;
    expect(m.lat).toBeCloseTo(55.875, 6);
    expect(m.h).toBeCloseTo(950, 6);
    expect(m.heading_deg).toBeCloseTo(0, 1);
    expect(interpolate(tr, T0 + 150_000)!.heading_deg).toBeGreaterThan(80);
  });
  it("returns null outside the track", () => {
    expect(interpolate(tr, T0 - 1)).toBeNull();
    expect(interpolate(tr, T0 + 201_000)).toBeNull();
    expect(interpolate([tr[0]], T0)).toBeNull();
  });
  it("accepts seconds, ms and ISO timestamps", () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toMs("2026-03-01T12:00:00Z")).toBe(T0);
  });
});

describe("parseVehicles", () => {
  it("maps contract features and drops malformed ones", () => {
    const f = (c: number[], t = "2026-03-01T12:00:00Z") => ({
      type: "Feature" as const, geometry: { type: "Point" as const, coordinates: c as [number, number, number] },
      properties: { id: "i", kind: "subway" as const, label: "Inner", mode: "simulated" as const, heading_deg: 10, speed_ms: 5, t },
    });
    const out = parseVehicles({ type: "FeatureCollection", features: [f([-4.2, 55.8, 60]), f([-4.2, 55.8, 60], "bad"), f([-4.2, NaN, 60])] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ lon: -4.2, lat: 55.8, h: 60, t: T0, mode: "simulated" });
  });
});

describe("fixture mode", () => {
  it("is deterministic for a given time", async () => {
    const at = new Date(T0);
    expect(await getVehicles(undefined, at)).toEqual(await getVehicles(undefined, at));
  });
  it("filters by kind and has 4 subway trains", async () => {
    const s = await getVehicles("subway", new Date(T0));
    expect(s).toHaveLength(4);
    expect(s.every((x) => x.kind === "subway" && x.mode === "simulated")).toBe(true);
  });
  it("aircraft descend toward the runway and stay above ground", async () => {
    const tracks = await getTracks(new Date(T0), new Date(T0 + 3600_000));
    const ids = Object.keys(tracks);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const hs = tracks[id].map((s) => s[3]);
      expect(Math.min(...hs)).toBeGreaterThanOrEqual(FLAT_GROUND_M);
      expect(hs[0]).toBeGreaterThanOrEqual(hs[hs.length - 1]);
      expect(hs).toEqual([...hs].sort((a, b) => b - a));
    }
  });
  it("live positions lie on the replay track", async () => {
    const tracks = await getTracks(new Date(T0 - 3600_000), new Date(T0 + 3600_000));
    for (const a of await getVehicles("aircraft", new Date(T0 + 7_000))) {
      const m = interpolate(tracks[a.id], T0 + 7_000)!;
      expect(m.h).toBeCloseTo(a.h, -1);
      expect(Math.abs(m.lon - a.lon)).toBeLessThan(0.002);
    }
  });
});

describe("fixture matches the API contract", () => {
  it("emits Point [lon, lat, h] features with the documented properties", () => {
    const fc = fixtureVehicles(undefined, T0);
    expect(fc.type).toBe("FeatureCollection");
    for (const f of fc.features) {
      expect(f.geometry.coordinates).toHaveLength(3);
      expect(Object.keys(f.properties).sort()).toEqual(["heading_deg", "id", "kind", "label", "mode", "speed_ms", "t"]);
      expect(f.properties.mode).toBe("simulated");
    }
  });
  it("subway trains are deterministic and keep to the circle", () => {
    const a = fixtureVehicles("subway", T0), b = fixtureVehicles("subway", T0);
    expect(a).toEqual(b);
    for (const f of a.features) expect(Math.abs(f.geometry.coordinates[1] - 55.86)).toBeLessThanOrEqual(0.0076);
  });
});

describe("subwayTracks (client-side replay)", () => {
  it("covers the window for all trains and matches the live positions", async () => {
    const { tracks, labels } = subwayTracks(T0 - 3600_000, T0);
    expect(Object.keys(tracks)).toHaveLength(4);
    expect(Object.keys(labels)).toEqual(Object.keys(tracks));
    for (const v of await getVehicles("subway", new Date(T0 - 1800_000))) {
      const m = interpolate(tracks[v.id], T0 - 1800_000)!;
      expect(Math.abs(m.lon - v.lon)).toBeLessThan(1e-6);
    }
  });
});

describe("null heading and speed", () => {
  const f = { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [-4.43, 55.87, 62] as [number, number, number] },
    properties: { id: "ac", kind: "aircraft" as const, label: "EZY653E", mode: "live" as const, heading_deg: null, speed_ms: null, t: "2026-03-01T12:00:00Z" } };
  it("parses and holds still instead of dead-reckoning", () => {
    const [a] = parseVehicles({ type: "FeatureCollection", features: [f] });
    expect(a.heading_deg).toBeNull();
    expect(project(a, T0 + 10_000)).toEqual({ lon: -4.43, lat: 55.87, h: 62 });
    expect(project({ ...a, speed_ms: 5 }, T0 + 10_000).lon).toBe(-4.43); // speed but no heading
    expect(project({ ...a, heading_deg: 90, speed_ms: null }, T0 + 10_000).lon).toBe(-4.43);
  });
});
