// SPDX-License-Identifier: AGPL-3.0-or-later
// Thematic styling for the LoD1 tiles. One rule list per theme drives both the Cesium 3D Tiles style and
// the JS classifier (info panel, legend, tests), so they cannot drift apart.
// Tile sentinels (docs/methods/analytics.md B8): text 'none', numbers -1, epc_count 0. They mean "no data" and
// are drawn neutral grey; they never mean "safe".
import { DEFAULT_HEIGHT_COLOR, HEIGHT_RAMP } from "./tileset";

export type ThemeId = "height" | "epc" | "flood" | "noise" | "heritage";
type Op = "===" | "<";
export type Rule = [prop: string, op: Op, value: string | number];
export interface LegendEntry {
  label: string;
  color: string;
  rules: Rule[]; // all must hold; empty = catch-all
  noData?: boolean;
}
export interface Theme {
  id: ThemeId;
  label: string;
  unit?: string;
  entries: LegendEntry[];
  note: string;
}

export const NO_DATA_COLOR = DEFAULT_HEIGHT_COLOR;
const grey = (label: string, rules: Rule[] = []): LegendEntry => ({ label, color: NO_DATA_COLOR, rules, noData: true });

const heightEntries: LegendEntry[] = [
  grey("No LiDAR height (6 m default)", [["height_source", "===", "default"]]),
  ...HEIGHT_RAMP.map(([max, color], i): LegendEntry => {
    const prev = i ? HEIGHT_RAMP[i - 1][0] : null;
    return {
      label: max === Infinity ? `${prev}+` : prev === null ? `<${max}` : `${prev}-${max}`,
      color,
      rules: max === Infinity ? [] : [["height", "<", max]],
    };
  }),
];

// Colour ramps: cividis (EPC), ColorBrewer YlOrBr (flood), magma (noise), Okabe-Ito (heritage); all colourblind-safe.
const EPC = ["A", "B", "C", "D", "E", "F", "G"];
const EPC_COLORS = ["#00224e", "#2f406f", "#575c6e", "#7f7b74", "#a99a6b", "#d3bc58", "#fee838"];
const NOISE = ["<50", "50-54", "55-59", "60-64", "65-69", "70-74", "75+"];
const NOISE_COLORS = ["#fcfdbf", "#fec287", "#fb8861", "#e75263", "#b73779", "#7c2382", "#3b0f70"];

export const THEMES: Record<ThemeId, Theme> = {
  height: { id: "height", label: "Height", unit: "m", entries: heightEntries, note: "LoD1 block height (70th percentile of LiDAR returns)." },
  epc: {
    id: "epc",
    label: "EPC rating",
    entries: [
      ...EPC.map((r, i): LegendEntry => ({ label: r, color: EPC_COLORS[i], rules: [["epc_rating", "===", r]] })),
      grey("No EPC on record"),
    ],
    note: "Domestic EPCs only, median per building. Non-domestic buildings and unassessed homes show as no data. A is most efficient.",
  },
  flood: {
    id: "flood",
    label: "Flood",
    entries: [
      { label: "High", color: "#993404", rules: [["flood_max", "===", "high"]] },
      { label: "Medium", color: "#fe9929", rules: [["flood_max", "===", "medium"]] },
      { label: "Low", color: "#fee391", rules: [["flood_max", "===", "low"]] },
      grey("Not in a mapped flood zone"),
    ],
    note: "Highest SEPA likelihood across river, coastal and surface water. Grey means not mapped, not safe. Indicative only.",
  },
  noise: {
    id: "noise",
    label: "Noise",
    unit: "dB Lden",
    entries: [
      ...NOISE.map((b, i): LegendEntry => ({ label: b, color: NOISE_COLORS[i], rules: [["noise_band", "===", b]] })),
      grey("Outside the noise model"),
    ],
    note: "Strategic noise map (Round 4, Lden, all sources). Not for property enquiries.",
  },
  heritage: {
    id: "heritage",
    label: "Heritage",
    entries: [
      { label: "Listed A", color: "#d55e00", rules: [["lb_category", "===", "A"]] },
      { label: "Listed B", color: "#e69f00", rules: [["lb_category", "===", "B"]] },
      { label: "Listed C", color: "#56b4e9", rules: [["lb_category", "===", "C"]] },
      { label: "Conservation area", color: "#0072b2", rules: [["conservation_area", "===", 1]] },
      grey("Not designated"),
    ],
    note: "HES listed buildings (A, B, C) and conservation areas. Listing is by building, so a part of a listed complex may be missing.",
  },
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const parseTheme = (q: URLSearchParams, fallback: ThemeId = "height"): ThemeId => {
  const t = q.get("theme");
  return THEME_IDS.includes(t as ThemeId) ? (t as ThemeId) : fallback;
};

const lit = (v: string | number) => (typeof v === "string" ? `'${v}'` : String(v));
const cond = (rules: Rule[]) => (rules.length ? rules.map(([p, op, v]) => `\${${p}} ${op} ${lit(v)}`).join(" && ") : "true");

/** [condition, color] pairs for Cesium3DTileStyle. The last entry is the catch-all. */
export function styleConditions(id: ThemeId): [string, string][] {
  const es = THEMES[id].entries;
  const out = es.map((e): [string, string] => [cond(e.rules), `color('${e.color}')`]);
  if (es[es.length - 1].rules.length) out.push(["true", `color('${NO_DATA_COLOR}')`]);
  return out;
}

const holds = ([p, op, v]: Rule, props: Record<string, unknown>) => (op === "<" ? (props[p] as number) < (v as number) : props[p] === v);

/** Same first-match logic as the Cesium style, for the info panel and tests. */
export function classify(id: ThemeId, props: Record<string, unknown>): LegendEntry {
  const es = THEMES[id].entries;
  return es.find((e) => e.rules.every((r) => holds(r, props))) ?? es[es.length - 1];
}

const isNone = (v: unknown) => v === undefined || v === null || v === "none" || v === -1;

export interface AttrRow {
  label: string;
  value: string;
}
/** Info-panel rows for the analytics attributes. Sentinels read "no data"; flood 'none' reads "not mapped". */
export function analyticsRows(p: Record<string, unknown>): AttrRow[] {
  const num = (v: unknown, unit: string, d = 0) => (isNone(v) ? "no data" : `${(v as number).toFixed(d)} ${unit}`);
  const txt = (v: unknown, none = "no data") => (isNone(v) ? none : String(v));
  const rows: AttrRow[] = [];
  if (p.volume_m3 !== undefined) rows.push({ label: "Volume (area x height)", value: num(p.volume_m3, "m³") });
  if (p.storeys_est !== undefined) rows.push({ label: "Storeys (estimate)", value: `~${p.storeys_est}` });
  if (p.flood_max !== undefined) {
    rows.push({ label: "Flood, highest", value: txt(p.flood_max, "not mapped") });
    rows.push({ label: "River / coastal / surface", value: ["flood_river", "flood_coastal", "flood_surface"].map((k) => txt(p[k], "none")).join(" / ") });
  }
  if (p.noise_band !== undefined) rows.push({ label: "Noise (Lden)", value: isNone(p.noise_band) ? "outside model" : `${p.noise_band} dB${isNone(p.noise_lden_db) ? "" : ` (${(p.noise_lden_db as number).toFixed(0)})`}` });
  if (p.epc_rating !== undefined) {
    rows.push({ label: "EPC rating (median)", value: isNone(p.epc_rating) ? "no data" : `${p.epc_rating} (SAP ${(p.epc_sap_median as number).toFixed(0)}, ${p.epc_count} certs)` });
  }
  if (p.lb_category !== undefined) {
    rows.push({ label: "Listed building", value: isNone(p.lb_category) ? "not listed" : `Category ${p.lb_category}` });
    rows.push({ label: "Conservation area", value: p.conservation_area === 1 ? "yes" : "no" });
  }
  if (p.data_zone !== undefined) rows.push({ label: "Data Zone (2022)", value: txt(p.data_zone) });
  return rows;
}
