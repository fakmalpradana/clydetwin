// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { DECILE_COLORS, DENSITY_BINS, MIN_DOMINANT_SHARE, NO_DATA, densityLabels, type ZoneMode, type ZoneProps } from "@/lib/zones";

export function ZoneControls({ on, mode, error, onOn, onMode }: { on: boolean; mode: ZoneMode; error: boolean; onOn: (v: boolean) => void; onMode: (m: ZoneMode) => void }) {
  return (
    <div className="mt-2">
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={on} onChange={(e) => onOn(e.target.checked)} /> Data Zones (2022)
      </label>
      {error && <p className="text-[10px] text-red-300">Data Zones unavailable.</p>}
      {on && (
        <div>
          <div className="flex gap-1" role="radiogroup" aria-label="Data Zone measure">
            {([["simd", "SIMD decile"], ["density", "Population density"]] as const).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={mode === id} onClick={() => onMode(id)} className={`rounded border px-2 py-0.5 ${mode === id ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`}>{label}</button>
            ))}
          </div>
          {mode === "simd" ? (
            <div className="mt-2">
              <div className="flex h-2 overflow-hidden rounded-sm">{DECILE_COLORS.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
              <div className="mt-1 flex justify-between text-[10px] text-muted"><span>1 most deprived</span><span>10 least</span></div>
            </div>
          ) : (
            <ul className="mt-2 space-y-0.5">
              {DENSITY_BINS.map(([, c], i) => (
                <li key={c} className="flex items-center gap-2 text-[11px]"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: c }} />{densityLabels()[i]} people/km²</li>
              ))}
            </ul>
          )}
          <p className="mt-1 flex items-center gap-2 text-[11px] text-muted"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: NO_DATA }} />No data</p>
          {mode === "simd" && (
            <p className="mt-1 text-[10px] text-muted">
              <span className="inline-block h-2 w-4 align-middle" style={{ background: "repeating-linear-gradient(90deg,#86d549 0 2px,transparent 2px 4px)" }} /> Hatched: under {MIN_DOMINANT_SHARE * 100}% of the zone
              comes from one 2011 Data Zone, so the SIMD value is indicative.
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted">
            SIMD 2020v2 is published for 2011 Data Zones and carried to the 2022 zones by an area-weighted lookup, so deciles are approximate. Population: NRS mid-2024.
          </p>
        </div>
      )}
    </div>
  );
}

export function ZonePanel({ z, onClose }: { z: ZoneProps; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Data Zone", z.dz22],
    ["SIMD decile", z.simd_decile === null ? "no data" : `${z.simd_decile} (1 = most deprived)`],
    ["SIMD rank", z.simd_rank === null ? "no data" : `${z.simd_rank} of 6,976 (2020v2)`],
    ["Lookup share", z.simd_dominant_share === null ? "no data" : `${Math.round(z.simd_dominant_share * 100)}% from one 2011 zone`],
    ["Population (2024)", z.pop_2024 === null ? "no data" : z.pop_2024.toLocaleString("en-GB")],
    ["Density", z.pop_density_km2 === null ? "no data" : `${Math.round(z.pop_density_km2).toLocaleString("en-GB")} /km²`],
    ["Area", `${z.area_km2} km²`],
  ];
  return (
    <section className="absolute z-20 bottom-0 left-0 right-0 max-h-[55dvh] overflow-auto border-t border-line bg-panel/95 p-4 backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-16 sm:w-80 sm:rounded-lg sm:border">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{z.name}</h2>
        <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close panel">&times;</button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="text-right font-mono text-xs leading-5">{v}</dd></div>))}
      </dl>
      <p className="mt-3 text-[11px] text-muted">Area-level statistics describe the zone, not the people or buildings in it.</p>
    </section>
  );
}
