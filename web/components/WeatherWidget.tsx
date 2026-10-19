// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Now } from "@/lib/api";

const Bar = ({ label, v }: { label: string; v: number }) => (
  <div className="flex items-center gap-2">
    <span className="w-9 text-muted">{label}</span>
    <span className="h-1.5 flex-1 rounded bg-line"><span className="block h-full rounded bg-accent/70" style={{ width: `${v}%` }} /></span>
    <span className="w-8 text-right font-mono">{v}%</span>
  </div>
);

export default function WeatherWidget({ now }: { now: Now | null }) {
  if (!now) return null;
  const w = now.weather;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-1 font-medium uppercase tracking-wider text-muted">Weather (model)</p>
      <p className="font-mono text-lg">{w.temp_c} °C <span className="text-xs text-muted">wind {w.wind_ms} m/s, rain {w.precip_mm} mm</span></p>
      <div className="mt-1 space-y-0.5 text-[10px]"><Bar label="Low" v={w.cloud_low} /><Bar label="Mid" v={w.cloud_mid} /><Bar label="High" v={w.cloud_high} /></div>
    </div>
  );
}
