// SPDX-License-Identifier: AGPL-3.0-or-later
import { FIXTURE, POLLUTANT_LABEL, airPollutant, r1, ageLabel, isStale, type Now } from "@/lib/api";
import { STATUS_COLOR } from "@/lib/status";

/** Bottom strip from /now: river levels and air quality at a glance. */
export default function Ticker({ now, tick }: { now: Now | null; tick: number }) {
  if (!now) return null;
  const t = now.rivers[0]?.t ?? now.weather.t;
  const w = now.weather, wStale = isStale(w.t, "weather", tick);
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-4 overflow-x-auto whitespace-nowrap bg-bg/80 px-4 py-1.5 text-[11px] backdrop-blur">
      {FIXTURE && <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-medium text-amber-200">SAMPLE DATA</span>}
      <span className={`flex items-center gap-1.5 ${wStale ? "text-muted" : ""}`} title={`Model forecast, ${ageLabel(w.t, tick)}`}>
        <b className="font-mono">{w.temp_c}°C</b> {w.wind_ms} m/s {w.precip_mm} mm
        <span className="hidden font-mono text-muted sm:inline">cloud {w.cloud_low}/{w.cloud_mid}/{w.cloud_high}%</span>
        {wStale && <span className="rounded bg-red-400/20 px-1 text-red-200">stale</span>}
      </span>
      {now.rivers.map((r) => (
        <span key={r.id} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[r.status] }} />
          {r.name.replace("River ", "").replace(" at ", " @ ")} <b className="font-mono">{r.value} {r.unit}</b>
        </span>
      ))}
      {now.air.map((a) => {
        const p = airPollutant(a);
        return p && <span key={a.id} className="text-muted" title={`UK-AIR (Defra), provisional, ${ageLabel(a.t, tick)}`}>{POLLUTANT_LABEL[p]} {a.name.replace("Glasgow ", "")} <b className="font-mono text-fg">{r1(a[p]!)}</b></span>;
      })}
      <span className="text-muted">updated {ageLabel(t, tick)}</span>
    </div>
  );
}
