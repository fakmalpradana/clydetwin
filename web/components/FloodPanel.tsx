// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useEffect, useState } from "react";

type Counts = Record<"high" | "medium" | "low" | "none", number>;
interface FloodCounts {
  buildings: number;
  flood_river: Counts;
  flood_coastal: Counts;
  flood_surface: Counts;
  flood_max: Counts;
}
const ROWS: [keyof Omit<FloodCounts, "buildings">, string][] = [
  ["flood_max", "Any source (highest)"],
  ["flood_river", "River"],
  ["flood_coastal", "Coastal"],
  ["flood_surface", "Surface water"],
];

/** Flood exposure counts from a static fixture (web/public/scenarios/flood_counts.json, made by web/scripts/flood_counts.py). */
export default function FloodPanel() {
  const [c, setC] = useState<FloodCounts | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch("/scenarios/flood_counts.json").then((r) => r.json()).then(setC, () => setErr(true));
  }, []);
  const n = (v: number) => v.toLocaleString("en-GB");
  return (
    <aside className="absolute left-1/2 top-16 z-10 w-[min(92vw,26rem)] -translate-x-1/2 rounded-lg border border-line bg-panel/90 p-3 text-xs backdrop-blur">
      <p className="rounded bg-amber-400/15 px-2 py-1 font-medium text-amber-200">Non-operational scenario. Not a flood warning, forecast or risk assessment.</p>
      <p className="mt-2 text-muted">
        LoD1 buildings by SEPA flood likelihood (river, coastal and surface water). Likelihood is the chance of flooding in a given year: high 10%, medium 0.5%, low 0.1% (SEPA bands). Zones are
        indicative, so do not use them for property, insurance or planning decisions.
      </p>
      {err && <p className="mt-2 text-red-300">Counts unavailable.</p>}
      {c && (
        <table className="mt-2 w-full text-right font-mono">
          <thead className="text-muted">
            <tr><th className="text-left font-normal">Buildings</th><th className="font-normal">High</th><th className="font-normal">Medium</th><th className="font-normal">Low</th><th className="font-normal">Not mapped</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([k, label]) => (
              <tr key={k}><td className="text-left font-sans">{label}</td><td>{n(c[k].high)}</td><td>{n(c[k].medium)}</td><td>{n(c[k].low)}</td><td className="text-muted">{n(c[k].none)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {c && <p className="mt-1 text-[10px] text-muted">Of {n(c.buildings)} LoD1 buildings. Not mapped means outside the SEPA extents, not safe. Any overlap with a zone counts. Click a building for its attributes; the SEPA river and coastal zones are the coloured overlay.</p>}
    </aside>
  );
}
