// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { ageLabel, effectiveStatus, FIXTURE, FIXTURE_REF, getNow, getStations, getTimeseries, isStale, rebase, airPollutant, r1 } from "./api";

const T0 = Date.parse("2026-03-01T12:00:00Z");
const ago = (s: number) => new Date(T0 - s * 1000).toISOString();

describe("stale detection", () => {
  it("allows up to 2x the interval", () => {
    expect(isStale(ago(1700), "river_level", T0)).toBe(false);
    expect(isStale(ago(1900), "river_level", T0)).toBe(true);
    expect(isStale(ago(7000), "weather", T0)).toBe(false);
    expect(isStale(ago(7300), "air_quality", T0)).toBe(true);
  });
  it("treats missing or invalid timestamps as stale", () => {
    expect(isStale(null, "weather", T0)).toBe(true);
    expect(isStale("nope", "weather", T0)).toBe(true);
  });
  it("overrides status with stale, and unknown when no reading", () => {
    const s = { kind: "river_level" as const, status: "high" as const, latest: { t: ago(60), value: 1 } };
    expect(effectiveStatus(s, T0)).toBe("high");
    expect(effectiveStatus({ ...s, latest: { t: ago(5000), value: 1 } }, T0)).toBe("stale");
    expect(effectiveStatus({ ...s, latest: null }, T0)).toBe("unknown");
  });
  it("labels age", () => {
    expect(ageLabel(ago(20), T0)).toBe("just now");
    expect(ageLabel(ago(600), T0)).toBe("10 min ago");
    expect(ageLabel(ago(3 * 3600), T0)).toBe("3 h ago");
  });
});

describe("air pollutant choice", () => {
  it("rounds to one decimal", () => expect([r1(8.033), r1(13.579), r1(6)]).toEqual([8, 13.6, 6]));
  it("prefers PM2.5, falls back to NO2, else none", () => {
    expect(airPollutant({ pm25: 6, no2: 11 })).toBe("pm25");
    expect(airPollutant({ pm25: null, no2: 8 })).toBe("no2");
    expect(airPollutant({ pm25: null, no2: null })).toBeNull();
  });
});

describe("fixtures", () => {
  it("run in fixture mode when no API URL is set", () => expect(FIXTURE).toBe(true));
  it("rebase shifts ISO timestamps only", () => {
    const out = rebase({ t: "2026-01-01T12:00:00Z", n: 3, s: "x" }, FIXTURE_REF + 3600_000 + 5000);
    expect(out).toEqual({ t: "2026-01-01T13:00:00.000Z", n: 3, s: "x" });
  });
  it("stations parse as a contract-shaped FeatureCollection with fresh readings", async () => {
    const fc = await getStations();
    expect(fc.type).toBe("FeatureCollection");
    const kinds = new Set(fc.features.map((f) => f.properties.kind));
    expect(kinds).toEqual(new Set(["river_level", "rainfall", "weather", "air_quality"]));
    for (const f of fc.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThan(-4.6); expect(lon).toBeLessThan(-3.9);
      expect(lat).toBeGreaterThan(55.7); expect(lat).toBeLessThan(56);
      expect(effectiveStatus(f.properties)).not.toBe("stale");
    }
  });
  it("every station has a 24 h series ending now", async () => {
    for (const f of (await getStations()).features) {
      const ts = await getTimeseries(f.properties.id);
      expect(ts.points.length).toBeGreaterThan(20);
      const span = Date.parse(ts.points.at(-1)![0]) - Date.parse(ts.points[0][0]);
      expect(span).toBeGreaterThanOrEqual(23.9 * 3600_000);
      expect(isStale(ts.points.at(-1)![0], f.properties.kind)).toBe(false);
    }
  });
  it("now has weather, rivers and air", async () => {
    const n = await getNow();
    expect(n.rivers.length).toBeGreaterThan(0);
    expect(n.air[0].pm25).toBeTypeOf("number");
    expect(n.weather.temp_c).toBeTypeOf("number");
  });
});
