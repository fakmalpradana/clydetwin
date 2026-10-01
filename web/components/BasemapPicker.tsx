// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { availableBasemaps, type BasemapId } from "@/lib/basemap";

export default function BasemapPicker({ value, onChange }: { value: BasemapId; onChange: (id: BasemapId) => void }) {
  return (
    <div>
      <p className="mb-1 font-medium text-muted uppercase tracking-wider">Basemap</p>
      {availableBasemaps().map((b) => (
        <label key={b.id} className="flex items-center gap-2 py-0.5">
          <input type="radio" name="basemap" checked={value === b.id} onChange={() => onChange(b.id)} /> {b.label}
        </label>
      ))}
    </div>
  );
}
