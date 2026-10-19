// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { THEMES, THEME_IDS, type ThemeId } from "@/lib/themes";

/** Theme switcher + colourblind-safe legend. Grey swatches are always "no data" or "not designated", never "safe". */
export default function ThemeLegend({ theme, onChange }: { theme: ThemeId; onChange: (t: ThemeId) => void }) {
  const t = THEMES[theme];
  return (
    <div>
      <p className="mb-1 font-medium text-muted uppercase tracking-wider">Colour buildings by</p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Building theme">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={id === theme}
            onClick={() => onChange(id)}
            className={`rounded border px-2 py-0.5 ${id === theme ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`}
          >
            {THEMES[id].label}
          </button>
        ))}
      </div>
      <p className="mt-2 mb-1 text-muted">{t.label}{t.unit ? ` (${t.unit})` : ""}</p>
      <ul className="space-y-0.5">
        {t.entries.map((e) => (
          <li key={e.label} className="flex items-center gap-2 text-[11px]">
            <span className="inline-block h-2.5 w-4 shrink-0 rounded-sm" style={{ background: e.color }} />
            <span className={e.noData ? "text-muted" : ""}>{e.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-muted">{t.note}</p>
    </div>
  );
}
