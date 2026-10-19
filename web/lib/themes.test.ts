import { describe, expect, it } from "vitest";
import { THEMES, THEME_IDS, NO_DATA_COLOR, analyticsRows, classify, parseTheme, styleConditions } from "./themes";

const SENTINEL = {
  height_source: "lidar", height: 12, epc_rating: "none", epc_count: 0, epc_sap_median: -1, flood_max: "none",
  noise_band: "none", noise_lden_db: -1, lb_category: "none", conservation_area: 0,
};

describe("themes", () => {
  it("sentinels classify as no data (grey) in every analytics theme", () => {
    for (const id of ["epc", "flood", "noise", "heritage"] as const) {
      const e = classify(id, SENTINEL);
      expect(e.noData, id).toBe(true);
      expect(e.color).toBe(NO_DATA_COLOR);
    }
  });
  it("real values get their own colour", () => {
    expect(classify("epc", { epc_rating: "C" }).label).toBe("C");
    expect(classify("flood", { flood_max: "high" }).label).toBe("High");
    expect(classify("noise", { noise_band: "60-64" }).label).toBe("60-64");
    expect(classify("heritage", { lb_category: "B", conservation_area: 1 }).label).toBe("Listed B");
    expect(classify("heritage", { lb_category: "none", conservation_area: 1 }).label).toBe("Conservation area");
  });
  it("height: default-height buildings are grey, the ramp is ordered, the top is open-ended", () => {
    expect(classify("height", { height_source: "default", height: 6 }).noData).toBe(true);
    expect(classify("height", { height_source: "lidar", height: 5 }).label).toBe("<6");
    expect(classify("height", { height_source: "lidar", height: 20 }).label).toBe("16-22");
    expect(classify("height", { height_source: "lidar", height: 200 }).label).toBe("50+");
  });
  it("Cesium conditions mirror the entries and always end in a catch-all", () => {
    for (const id of THEME_IDS) {
      const c = styleConditions(id);
      expect(c[c.length - 1][0], id).toBe("true");
      expect(c.length).toBeGreaterThanOrEqual(THEMES[id].entries.length);
    }
    expect(styleConditions("flood")[0]).toEqual(["${flood_max} === 'high'", "color('#993404')"]);
    expect(styleConditions("heritage")[3][0]).toBe("${conservation_area} === 1");
    expect(styleConditions("height")[1][0]).toBe("${height} < 6");
  });
  it("legend colours are unique per theme except the grey no-data swatch", () => {
    for (const id of THEME_IDS) {
      const cols = THEMES[id].entries.filter((e) => !e.noData).map((e) => e.color);
      expect(new Set(cols).size, id).toBe(cols.length);
    }
  });
  it("parseTheme falls back on unknown values", () => {
    expect(parseTheme(new URLSearchParams("theme=noise"))).toBe("noise");
    expect(parseTheme(new URLSearchParams("theme=nope"))).toBe("height");
    expect(parseTheme(new URLSearchParams(""), "flood")).toBe("flood");
  });
  it("info rows never show sentinels as values", () => {
    const rows = analyticsRows({ ...SENTINEL, volume_m3: 1200.4, storeys_est: 3, flood_river: "none", flood_coastal: "none", flood_surface: "none", data_zone: "S01007000" });
    const v = (l: string) => rows.find((r) => r.label === l)?.value;
    expect(v("Flood, highest")).toBe("not mapped");
    expect(v("Noise (Lden)")).toBe("outside model");
    expect(v("EPC rating (median)")).toBe("no data");
    expect(v("Storeys (estimate)")).toBe("~3");
    expect(v("Listed building")).toBe("not listed");
    expect(rows.some((r) => r.value.includes("-1"))).toBe(false);
  });
  it("info rows show real values", () => {
    const rows = analyticsRows({ epc_rating: "C", epc_sap_median: 68.4, epc_count: 12, noise_band: "65-69", noise_lden_db: 66.6, lb_category: "A", conservation_area: 1 });
    expect(rows.find((r) => r.label.startsWith("EPC"))?.value).toBe("C (SAP 68, 12 certs)");
    expect(rows.find((r) => r.label.startsWith("Noise"))?.value).toBe("65-69 dB (67)");
    expect(rows.find((r) => r.label === "Conservation area")?.value).toBe("yes");
  });
});
