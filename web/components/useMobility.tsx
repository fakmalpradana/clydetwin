// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as CesiumNS from "cesium";
import { FIXTURE } from "@/lib/api";
import { useVehicles } from "@/lib/useVehicles";
import { MODE_COLOR, MODE_LABEL, getTracks, interpolate, project, type Mode, type Tracks, type Vehicle, type VKind } from "@/lib/vehicles";

type Api = { lib: typeof import("@/lib/cesium"); viewer: CesiumNS.Viewer } | null;
const DAY_MIN = 1440;
const glasgow = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(ms);

const icons = new Map<string, string>();
/** Canvas icon pointing up: a plane silhouette or a ringed dot, in the mode's colour. Rotated per frame by the billboard. */
function icon(kind: VKind, mode: Mode) {
  const key = kind + mode;
  let url = icons.get(key);
  if (!url) {
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    const g = c.getContext("2d")!;
    g.fillStyle = MODE_COLOR[mode];
    g.strokeStyle = "#0b0e14";
    g.lineWidth = 3;
    g.beginPath();
    if (kind === "aircraft") {
      g.moveTo(24, 3); g.lineTo(29, 18); g.lineTo(45, 30); g.lineTo(45, 35); g.lineTo(29, 30); g.lineTo(27, 41); g.lineTo(33, 45); g.lineTo(33, 47); g.lineTo(24, 45); g.lineTo(15, 47); g.lineTo(15, 45); g.lineTo(21, 41); g.lineTo(19, 30); g.lineTo(3, 35); g.lineTo(3, 30); g.lineTo(19, 18);
      g.closePath();
    } else g.roundRect(14, 6, 20, 36, 7);
    g.stroke();
    g.fill();
    url = c.toDataURL();
    icons.set(key, url);
  }
  return url;
}

export interface Picked { id: string; label: string; kind: VKind; mode: Mode; replay: boolean }

/**
 * Mobility layer for /explore: aircraft and subway markers (heading-aligned, honest mode colour), click to
 * follow, and a 24 h replay of /tracks driven by the Cesium clock. Returns the controls for the Layers panel and the detail panel.
 */
export function useMobility(getApi: () => Api, ready: boolean): { controls: ReactNode; panel: ReactNode } {
  const [on, setOn] = useState(true);
  const [offsetMin, setOffsetMin] = useState<number | null>(null); // null = live; else minutes before now (negative)
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [following, setFollowing] = useState(false);
  const [tracks, setTracks] = useState<Tracks | null>(null);
  const [trackErr, setTrackErr] = useState(false);
  const replay = offsetMin !== null;
  const vehicles = useVehicles(on && !replay);
  const ds = useRef<CesiumNS.CustomDataSource | null>(null);
  const latest = useRef(new Map<string, Vehicle>());
  const [base, setBase] = useState(0); // 'now' when replay was entered, epoch ms
  const clockMs = useRef(0);

  // Data source + click handler, once the viewer exists.
  useEffect(() => {
    const a = getApi();
    if (!a || !ready) return;
    const C = a.lib.Cesium;
    const source = new C.CustomDataSource("mobility");
    a.viewer.dataSources.add(source);
    ds.current = source;
    const handler = new C.ScreenSpaceEventHandler(a.viewer.scene.canvas);
    handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
      const hit = a.viewer.scene.pick(e.position);
      const ent = hit?.id instanceof C.Entity && hit.id.entityCollection?.owner === source ? hit.id : null;
      if (!ent) return;
      const m = ent.properties?.meta?.getValue();
      setPicked(m);
      setFollowing(false);
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    return () => {
      handler.destroy();
      if (!a.viewer.isDestroyed()) { a.viewer.trackedEntity = undefined; a.viewer.dataSources.remove(source, true); }
      ds.current = null;
    };
  }, [getApi, ready]);

  const camHeading = (a: NonNullable<Api>, hd: () => number) => new a.lib.Cesium.CallbackProperty(() => -(a.lib.Cesium.Math.toRadians(hd()) - a.viewer.camera.heading), false);

  // Live: one entity per vehicle, position and rotation read from the latest sample every frame.
  useEffect(() => {
    const a = getApi(), source = ds.current;
    if (!a || !source || !ready || replay) return;
    const C = a.lib.Cesium;
    const seen = new Set<string>();
    for (const v of vehicles) {
      seen.add(v.id);
      const had = latest.current.has(v.id);
      latest.current.set(v.id, v);
      if (had) continue;
      const cur = () => latest.current.get(v.id)!;
      source.entities.add({
        id: v.id,
        position: new C.CallbackProperty(() => { const p = project(cur(), Date.now()); return C.Cartesian3.fromDegrees(p.lon, p.lat, p.h); }, false) as unknown as CesiumNS.PositionProperty,
        billboard: {
          image: icon(v.kind, v.mode),
          scale: v.kind === "aircraft" ? 0.9 : 0.6,
          rotation: camHeading(a, () => cur().heading_deg),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: { text: v.label, font: "11px sans-serif", pixelOffset: new C.Cartesian2(0, 24), fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: new C.DistanceDisplayCondition(0, 30000) },
        properties: { meta: { id: v.id, label: v.label, kind: v.kind, mode: v.mode, replay: false } },
      });
    }
    for (const id of [...latest.current.keys()]) if (!seen.has(id)) { latest.current.delete(id); source.entities.removeById(id); }
  }, [vehicles, replay, ready, getApi]);

  // Entering or leaving replay: clear the entities, fetch tracks on entry, restore the clock on exit.
  const entering = replay;
  useEffect(() => {
    const a = getApi(), source = ds.current;
    if (!a || !source || !ready) return;
    source.entities.removeAll();
    latest.current.clear();
    a.viewer.trackedEntity = undefined;
    if (!entering) { a.viewer.clock.currentTime = a.lib.Cesium.JulianDate.now(); return; }
    let alive = true;
    getTracks(new Date(base - DAY_MIN * 60_000), new Date(base)).then((t) => alive && setTracks(t), () => alive && setTrackErr(true));
    return () => { alive = false; };
  }, [entering, base, ready, getApi]);

  // Replay entities: Cesium SampledPositionProperty per track; heading from the same samples.
  useEffect(() => {
    const a = getApi(), source = ds.current;
    if (!a || !source || !ready || !tracks) return;
    const C = a.lib.Cesium;
    source.entities.removeAll();
    for (const [id, tr] of Object.entries(tracks)) {
      if (tr.length < 2) continue;
      const pos = new C.SampledPositionProperty();
      pos.setInterpolationOptions({ interpolationDegree: 1, interpolationAlgorithm: C.LinearApproximation });
      const times = tr.map((s) => (typeof s[0] === "string" ? Date.parse(s[0]) : s[0] < 1e11 ? s[0] * 1000 : s[0]));
      tr.forEach((s, i) => pos.addSample(C.JulianDate.fromDate(new Date(times[i])), C.Cartesian3.fromDegrees(s[1], s[2], s[3])));
      pos.forwardExtrapolationType = pos.backwardExtrapolationType = C.ExtrapolationType.NONE;
      const label = id.replace(/^fx-ac-/, "Sample ");
      source.entities.add({
        id,
        availability: new C.TimeIntervalCollection([new C.TimeInterval({ start: C.JulianDate.fromDate(new Date(times[0])), stop: C.JulianDate.fromDate(new Date(times[times.length - 1])) })]),
        position: pos,
        billboard: {
          image: icon("aircraft", FIXTURE ? "simulated" : "live"),
          scale: 0.9,
          rotation: camHeading(a, () => interpolate(tr, clockMs.current)?.heading_deg ?? 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { meta: { id, label, kind: "aircraft", mode: FIXTURE ? "simulated" : "live", replay: true } },
      });
    }
  }, [tracks, ready, getApi]);

  // The slider drives the Cesium clock (replay only).
  useEffect(() => {
    const a = getApi();
    if (!a || !ready || offsetMin === null) return;
    clockMs.current = base + offsetMin * 60_000;
    a.viewer.clock.currentTime = a.lib.Cesium.JulianDate.fromDate(new Date(clockMs.current));
  }, [offsetMin, base, ready, getApi]);

  // Play: one minute of history per 200 ms, stopping at "now".
  useEffect(() => {
    if (!playing || !replay || offsetMin === 0) return;
    const h = setInterval(() => setOffsetMin((m) => (m !== null && m < 0 ? Math.min(0, m + 1) : m)), 200);
    return () => clearInterval(h);
  }, [playing, replay, offsetMin]);

  useEffect(() => {
    const a = getApi(), source = ds.current;
    if (!a || !source) return;
    a.viewer.trackedEntity = following && picked ? source.entities.getById(picked.id) : undefined;
  }, [following, picked, getApi]);

  useEffect(() => { if (ds.current) ds.current.show = on; }, [on, ready]);

  const toggleReplay = () => {
    setBase(Date.now()); setOffsetMin(replay ? null : -60); setPlaying(false);
    setPicked(null); setFollowing(false); setTracks(null); setTrackErr(false);
  };
  const sel = picked && vehicles.find((v) => v.id === picked.id);
  const controls = (
    <div className="mt-3">
      <p className="mb-1 font-medium text-muted uppercase tracking-wider">Mobility</p>
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Aircraft and Subway
      </label>
      {on && (
        <>
          <p className="flex flex-wrap gap-x-3 text-[10px] text-muted">
            {(Object.keys(MODE_COLOR) as Mode[]).map((m) => (
              <span key={m} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: MODE_COLOR[m] }} />{MODE_LABEL[m]}</span>
            ))}
          </p>
          {FIXTURE && <p className="mt-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">SAMPLE DATA: invented flights</p>}
          <div className="mt-2 flex items-center gap-2">
            <button onClick={toggleReplay} className={`rounded px-2 py-0.5 ${replay ? "bg-accent text-bg" : "border border-line"}`}>
              {replay ? "Back to live" : "Replay 24 h"}
            </button>
            {replay && <button onClick={() => setPlaying((p) => !p)} className="rounded border border-line px-2 py-0.5">{playing && offsetMin !== 0 ? "Pause" : "Play"}</button>}
          </div>
          {replay && (
            <>
              <input type="range" className="mt-2 w-full" min={-DAY_MIN} max={0} step={1} value={offsetMin} aria-label="Replay time" onChange={(e) => { setPlaying(false); setOffsetMin(+e.target.value); }} />
              <p className="font-mono text-[10px] text-muted">{glasgow(base + offsetMin * 60_000)} (Glasgow){trackErr ? ", tracks unavailable" : tracks && !Object.keys(tracks).length ? ", no tracks" : ""}</p>
              <p className="text-[10px] text-muted">Aircraft only; the Subway is simulated and shown live.</p>
            </>
          )}
        </>
      )}
    </div>
  );

  const panel = picked && (
    <section className="absolute z-20 bottom-8 left-0 right-0 border-t border-line bg-panel/95 p-4 backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-16 sm:w-80 sm:rounded-lg sm:border">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{picked.label} <span className="font-normal text-muted">{picked.kind === "aircraft" ? "aircraft" : "Subway train"}</span></h2>
        <button onClick={() => { setPicked(null); setFollowing(false); }} className="text-muted hover:text-fg" aria-label="Close panel">&times;</button>
      </div>
      <p className="flex items-center gap-2 text-xs">
        <span className="rounded px-1.5 py-0.5 font-medium text-bg" style={{ background: MODE_COLOR[picked.mode] }}>{MODE_LABEL[picked.mode]}</span>
        {FIXTURE && <span className="text-amber-200">SAMPLE DATA</span>}
        {picked.replay && <span className="text-muted">replay</span>}
      </p>
      {sel && <p className="mt-2 font-mono text-xs text-muted">{Math.round(sel.speed_ms * 1.944)} kt · {Math.round(sel.heading_deg)}° · {Math.round(sel.h)} m (ellipsoidal)</p>}
      <button onClick={() => setFollowing((f) => !f)} className="mt-3 rounded border border-line px-2 py-1 text-xs hover:text-accent">{following ? "Stop following" : "Follow with camera"}</button>
    </section>
  );

  return { controls, panel };
}
