// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FIXTURE, ageLabel, effectiveStatus, getNow, getStations, getTimeseries, airPollutant, r1, POLLUTANT_LABEL, type Kind, type Pollutant, type Now, type StationFeature, type Timeseries } from "@/lib/api";
import { STATUS_COLOR } from "@/lib/status";
import Sparkline from "./Sparkline";

const POLL_MS = 60_000;
const TITLES: Record<Kind, { title: string; note: string }> = {
  weather: { title: "Weather", note: "Model forecast (Open-Meteo, UK Met Office UKV), not a station measurement." },
  river_level: { title: "River levels", note: "SEPA gauge readings. Provisional data, may be revised; not a flood warning." },
  rainfall: { title: "Rainfall", note: "SEPA rain gauge, 15-minute totals. Provisional." },
  air_quality: { title: "Air quality", note: "UK-AIR (Defra), provisional and not ratified. PM2.5 where the site measures it, otherwise NO₂; each card names the pollutant shown." },
};

function Chip({ status }: { status: string }) {
  const c = STATUS_COLOR[status as keyof typeof STATUS_COLOR] ?? STATUS_COLOR.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-wide">
      <span className="h-2 w-2 rounded-full" style={{ background: c }} />{status}
    </span>
  );
}

function Station({ f, series, now, pollutant }: { f: StationFeature; series?: Timeseries; now: number; pollutant?: Pollutant }) {
  const p = f.properties, st = effectiveStatus(p, now);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{p.name}{pollutant && <span className="ml-2 font-mono text-xs text-muted">{POLLUTANT_LABEL[pollutant]}</span>}</h3>
        <Chip status={st} />
      </div>
      <p className="mt-1 font-mono text-2xl">
        {p.latest ? (p.kind === "air_quality" ? r1(p.latest.value) : p.latest.value) : "–"} <span className="text-sm text-muted">{p.unit}</span>
        <span className="ml-3 text-[11px] text-muted">{p.latest ? ageLabel(p.latest.t, now) : "no reading"}</span>
      </p>
      <div className="mt-2">{series ? <Sparkline points={series.points} unit={p.unit} color={STATUS_COLOR[st]} label={p.name} /> : <p className="h-20 text-xs text-muted">Loading chart&hellip;</p>}</div>
    </li>
  );
}

export default function Live() {
  const [stations, setStations] = useState<StationFeature[] | null>(null);
  const [nowData, setNowData] = useState<Now | null>(null);
  const [series, setSeries] = useState<Record<string, Timeseries>>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [s, n] = await Promise.all([getStations(), getNow()]);
        if (!alive) return;
        setStations(s.features); setNowData(n); setError(null); setTick(Date.now());
        for (const f of s.features) {
          const a = n.air.find((x) => x.id === f.properties.id);
          const param = f.properties.kind === "air_quality" && a ? airPollutant(a) ?? undefined : undefined;
          getTimeseries(f.properties.id, 24, param).then((t) => alive && setSeries((o) => ({ ...o, [f.properties.id]: t })), () => {});
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const h = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(h); };
  }, []);

  const airOf = (id: string) => { const a = nowData?.air.find((x) => x.id === id); return a ? airPollutant(a) ?? undefined : undefined; };
  const groups = (Object.keys(TITLES) as Kind[]).map((k) => [k, (stations ?? []).filter((f) => f.properties.kind === k)] as const).filter(([, l]) => l.length);
  const newest = Math.max(0, ...(stations ?? []).map((f) => (f.properties.latest ? Date.parse(f.properties.latest.t) : 0)));
  const staleCount = (stations ?? []).filter((f) => effectiveStatus(f.properties, tick) === "stale").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <Link href="/" className="font-mono text-xs tracking-widest text-accent">&larr; CLYDETWIN</Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Glasgow now</h1>
        {stations && (
          <span className="rounded-full border border-line px-2.5 py-1 text-xs" style={{ color: staleCount ? STATUS_COLOR.alert : STATUS_COLOR.normal }}>
            {FIXTURE ? "Sample data" : staleCount ? `${staleCount} source${staleCount > 1 ? "s" : ""} stale` : "Live"} &middot; updated {newest ? ageLabel(new Date(newest).toISOString(), tick) : "never"}
          </span>
        )}
      </div>

      {FIXTURE && (
        <div role="status" className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          <strong>Sample data.</strong> No live backend is connected, so every number below is made up for preview and is not a real reading.
        </div>
      )}
      {error && <p role="alert" className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">Could not reach the data service ({error}). Showing the last values received, if any.</p>}

      {nowData && (
        <p className="mt-4 text-sm text-muted">
          {nowData.weather.temp_c} °C, wind {nowData.weather.wind_ms} m/s, precipitation {nowData.weather.precip_mm} mm; cloud low/mid/high {nowData.weather.cloud_low}/{nowData.weather.cloud_mid}/{nowData.weather.cloud_high} %.
        </p>
      )}
      {!stations && !error && <p className="mt-8 text-sm text-muted">Loading&hellip;</p>}

      <div className="mt-6 grid items-start gap-4 sm:grid-cols-2">
        {groups.map(([k, list]) => (
          <section key={k} className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-lg font-semibold">{TITLES[k].title}</h2>
            <p className="mt-1 text-xs text-muted">{TITLES[k].note}</p>
            <ul className="mt-2 divide-y divide-line">
              {list.map((f) => <Station key={f.properties.id} f={f} series={series[f.properties.id]} now={tick} pollutant={k === "air_quality" ? airOf(f.properties.id) : undefined} />)}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted">
        Non-operational: for information only, never for safety or flood decisions. Sources and licences:{" "}
        <Link href="/about/data" className="underline">Data and licences</Link>.
      </p>
    </main>
  );
}
