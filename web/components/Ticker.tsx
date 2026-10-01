// SPDX-License-Identifier: AGPL-3.0-or-later
import { FIXTURE, ageLabel, type Now } from "@/lib/api";
import { STATUS_COLOR } from "@/lib/status";

/** Bottom strip from /now: river levels and air quality at a glance. */
export default function Ticker({ now, tick }: { now: Now | null; tick: number }) {
  if (!now) return null;
  const t = now.rivers[0]?.t ?? now.weather.t;
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-4 overflow-x-auto whitespace-nowrap bg-bg/80 px-4 py-1.5 text-[11px] backdrop-blur">
      {FIXTURE && <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-medium text-amber-200">SAMPLE DATA</span>}
      {now.rivers.map((r) => (
        <span key={r.id} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[r.status] }} />
          {r.name.replace("River ", "").replace(" at ", " @ ")} <b className="font-mono">{r.value} {r.unit}</b>
        </span>
      ))}
      {now.air.map((a) => (
        <span key={a.id} className="text-muted">PM2.5 {a.name.replace("Glasgow ", "")} <b className="font-mono text-fg">{a.pm25}</b></span>
      ))}
      <span className="text-muted">updated {ageLabel(t, tick)}</span>
    </div>
  );
}
