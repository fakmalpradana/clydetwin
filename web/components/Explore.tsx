// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { carry, cameraQuery, paramsToCamera, setParam, withCamera, type CameraState } from "@/lib/camera";
import { sceneDate } from "@/lib/time";
import { FIXTURE, ageLabel, effectiveStatus, getTimeseries, type Timeseries } from "@/lib/api";
import { STATUS_COLOR } from "@/lib/status";
import { useConditions } from "@/lib/useConditions";
import Sparkline from "./Sparkline";
import Ticker from "./Ticker";
import { useMobility } from "./useMobility";
import WeatherWidget from "./WeatherWidget";
import { parseBasemap, type BasemapId } from "@/lib/basemap";
import Attribution from "./Attribution";
import BasemapPicker from "./BasemapPicker";
import { BUILDING_FIELDS, DEFAULT_HEIGHT_COLOR, HEIGHT_RAMP, type BuildingProps } from "@/lib/tileset";
import type * as CesiumNS from "cesium";

type CesiumLib = typeof import("@/lib/cesium");

const glasgowTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(d);

const fmt = (v: unknown, unit?: string) => {
  if (typeof v === "number") return `${Number.isInteger(v) ? v : v.toFixed(2)}${unit ? " " + unit : ""}`;
  return String(v ?? "-");
};

export default function Explore() {
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<{
    lib: CesiumLib;
    viewer: CesiumNS.Viewer;
    tileset: CesiumNS.Cesium3DTileset;
    ionTerrain?: CesiumNS.TerrainProvider;
    flood?: CesiumNS.ImageryLayer;
  } | null>(null);
  const { stations, now: nowData, tick } = useConditions();
  const [flood, setFlood] = useState(false);
  const [floodErr, setFloodErr] = useState(false);
  const [gaugeId, setGaugeId] = useState<string | null>(null);
  const [gSeries, setGSeries] = useState<{ id: string; ts: Timeseries } | null>(null);
  const gaugeF = stations.find((f) => f.properties.id === gaugeId);
  const gauge = gaugeF ? { f: gaugeF, series: gSeries?.id === gaugeId ? gSeries.ts : undefined } : null;
  const [cam, setCam] = useState<CameraState | null>(null);
  const [selected, setSelected] = useState<BuildingProps | null>(null);
  const [buildings, setBuildings] = useState(true);
  const [terrain, setTerrain] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ion, setIon] = useState(false);
  const [lowGpu, setLowGpu] = useState(false);
  const [bm, setBm] = useState<BasemapId>("dark");
  const mobility = useMobility(useCallback(() => api.current, []), ready);

  useEffect(() => {
    let disposed = false;
    const q = new URLSearchParams(window.location.search);
    (async () => {
      const lib = await import("@/lib/cesium");
      if (disposed || !container.current) return;
      setLowGpu(q.get("gpu") === "low");
      setBm(parseBasemap(q));
      const { viewer, terrain: terrainKind, realTerrain } = await lib.createViewer(container.current, { interactive: true, date: sceneDate(q), basemap: parseBasemap(q) });
      if (disposed) return viewer.destroy();
      setIon(terrainKind !== "flat");
      const C = lib.Cesium;
      let tileset: CesiumNS.Cesium3DTileset;
      try {
        tileset = await lib.loadBuildings(viewer);
      } catch (e) {
        setError(`Could not load the building tileset: ${(e as Error).message}`);
        return;
      }
      // ponytail: debug hook for terrain/alignment checks (NEXT_PUBLIC_DEBUG_HOOKS=1)
      if (process.env.NEXT_PUBLIC_DEBUG_HOOKS === "1") (window as unknown as { __cesium: unknown }).__cesium = { viewer, tileset, C };
      api.current = { lib, viewer, tileset, ionTerrain: realTerrain };
      lib.setCamera(viewer, paramsToCamera(q));
      const sync = () => {
        const c = lib.getCamera(viewer);
        setCam(c);
        window.history.replaceState(null, "", withCamera(window.location.search, c));
      };
      sync();
      viewer.camera.moveEnd.addEventListener(sync);

      // click -> info panel, with highlight
      let prev: { feature: CesiumNS.Cesium3DTileFeature; color: CesiumNS.Color } | null = null;
      const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
        if (prev) prev.feature.color = prev.color;
        prev = null;
        const picked = viewer.scene.pick(e.position);
        const gid = picked?.id instanceof C.Entity ? picked.id.id : null;
        if (gid) {
          setSelected(null);
          setGaugeId(gid);
        } else setGaugeId(null);
        if (picked instanceof C.Cesium3DTileFeature) {
          prev = { feature: picked, color: C.Color.clone(picked.color) };
          picked.color = C.Color.WHITE;
          const props: Record<string, unknown> = {};
          for (const id of picked.getPropertyIds()) props[id] = picked.getProperty(id);
          setSelected(props as unknown as BuildingProps);
        } else if (!gid) setSelected(null);
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      setReady(true);
    })().catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      api.current?.viewer.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const C = a.lib.Cesium;
    a.viewer.entities.removeAll();
    for (const f of stations.filter((x) => x.properties.kind === "river_level")) {
      const [lon, lat] = f.geometry.coordinates;
      a.viewer.entities.add({
        id: f.properties.id,
        // ponytail: clamped to whichever terrain is active (own, ion or the flat FLAT_GROUND_M plane)
        position: C.Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: 16,
          color: C.Color.fromCssColorString(STATUS_COLOR[effectiveStatus(f.properties, tick)]),
          outlineColor: C.Color.WHITE,
          outlineWidth: 2,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }, [stations, tick, ready]);

  useEffect(() => {
    if (!gaugeId) return;
    let alive = true;
    getTimeseries(gaugeId, 24).then((ts) => alive && setGSeries({ id: gaugeId, ts }), () => {});
    return () => { alive = false; };
  }, [gaugeId]);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (!flood) { if (a.flood) a.flood.show = false; return; }
    if (a.flood) { a.flood.show = true; return; }
    a.lib.floodLayer().then((l) => { a.viewer.imageryLayers.add(l); a.flood = l; }, (e) => { console.warn("flood layer failed", e); setFloodErr(true); setFlood(false); });
  }, [flood, ready]);

  useEffect(() => {
    if (api.current) api.current.tileset.show = buildings;
  }, [buildings, ready]);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.viewer.terrainProvider = terrain && a.ionTerrain ? a.ionTerrain : a.lib.flatTerrain();
  }, [terrain, ready]);

  const carried = typeof window === "undefined" ? "" : carry(window.location.search);
  const changeBasemap = (id: BasemapId) => {
    setBm(id);
    window.history.replaceState(null, "", setParam(window.location.search, "bm", id));
    const a = api.current;
    if (a) a.lib.setBasemap(a.viewer, id).catch((e) => console.warn("basemap failed", e));
  };

  const immersive = `/immersive${cam ? `?${cameraQuery(cam)}${carried}` : ""}`;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <div ref={container} className="absolute inset-0" />

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-3 px-4 py-3">
        <Link href="/" className="pointer-events-auto rounded-md bg-panel/85 px-3 py-2 font-mono text-xs tracking-widest text-accent backdrop-blur">
          CLYDETWIN
        </Link>
        <Link href={immersive} className="pointer-events-auto rounded-md bg-panel/85 px-3 py-2 text-sm backdrop-blur hover:text-accent">
          Immersive view &rarr;
        </Link>
      </header>

      <aside className="absolute bottom-10 max-h-[70dvh] overflow-auto left-4 z-10 w-56 rounded-lg border border-line bg-panel/90 p-3 text-xs backdrop-blur">
        <p className="mb-2 font-medium text-muted uppercase tracking-wider">Layers</p>
        <label className="flex items-center gap-2 py-1">
          <input type="checkbox" checked={buildings} onChange={(e) => setBuildings(e.target.checked)} /> Buildings (LoD1)
        </label>
        <label className="flex items-center gap-2 py-1" title={ion ? "" : "Needs terrain (own or ion); flat ground is used instead"}>
          <input type="checkbox" checked={terrain && ion} disabled={!ion} onChange={(e) => setTerrain(e.target.checked)} /> Terrain{ion ? "" : " (unavailable)"}
        </label>
        <label className="flex items-center gap-2 py-1">
          <input type="checkbox" checked={flood} onChange={(e) => { setFloodErr(false); setFlood(e.target.checked); }} /> SEPA flood zones
        </label>
        {flood && <p className="text-[10px] text-muted">River high/medium and coastal medium likelihood. Shown when zoomed in. &copy; SEPA, OGL v3.</p>}
        {floodErr && <p className="text-[10px] text-red-300">Flood map service unavailable.</p>}
        <div className="mt-3">
          <BasemapPicker value={bm} onChange={changeBasemap} />
        </div>
        <p className="mt-3 mb-1 font-medium text-muted uppercase tracking-wider">Height (m)</p>
        <div className="flex h-2 overflow-hidden rounded-sm">
          {HEIGHT_RAMP.map(([, c]) => (<span key={c} className="flex-1" style={{ background: c }} />))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted"><span>&lt;6</span><span>16</span><span>50+</span></div>
        <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: DEFAULT_HEIGHT_COLOR }} /> No LiDAR height (6 m default)
        </p>
        {mobility.controls}
        <WeatherWidget now={nowData} />
        <p className="mt-2 text-[10px] text-muted">Sun: Glasgow, {glasgowTime(sceneDate(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)))}</p>
      </aside>

      {gauge && (
        <section className="absolute z-20 bottom-8 left-0 right-0 border-t border-line bg-panel/95 p-4 backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-16 sm:w-80 sm:rounded-lg sm:border">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{gauge.f.properties.name}</h2>
            <button onClick={() => setGaugeId(null)} className="text-muted hover:text-fg" aria-label="Close panel">&times;</button>
          </div>
          <p className="font-mono text-xl">
            {gauge.f.properties.latest?.value ?? "-"} <span className="text-sm text-muted">{gauge.f.properties.unit}</span>
            <span className="ml-2 text-xs" style={{ color: STATUS_COLOR[effectiveStatus(gauge.f.properties, tick)] }}>{effectiveStatus(gauge.f.properties, tick)}</span>
          </p>
          <p className="mb-2 text-[11px] text-muted">{gauge.f.properties.latest ? ageLabel(gauge.f.properties.latest.t, tick) : "no reading"}{FIXTURE ? " · SAMPLE DATA" : ""}</p>
          {gauge.series && <Sparkline points={gauge.series.points} unit={gauge.f.properties.unit} label={gauge.f.properties.name} color={STATUS_COLOR[effectiveStatus(gauge.f.properties, tick)]} />}
        </section>
      )}

      {mobility.panel}

      {selected && (
        <section className="absolute z-20 bottom-0 left-0 right-0 max-h-[55dvh] overflow-auto border-t border-line bg-panel/95 p-4 backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-16 sm:w-80 sm:rounded-lg sm:border">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Building</h2>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-fg" aria-label="Close panel">&times;</button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {BUILDING_FIELDS.filter((f) => f.key !== "h_p90" || selected.h_p90 !== undefined).map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-muted">{f.label}</dt>
                <dd className="break-all text-right font-mono text-xs leading-5">{fmt(selected[f.key], f.unit)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            LoD1 block height (70th percentile); towers shown fully in LoD2 (coming).
          </p>
          {selected.height_source === "default" && (
            <p className="mt-3 text-xs text-muted">No LiDAR coverage for this footprint: height is a 6 m placeholder.</p>
          )}
        </section>
      )}

      {lowGpu && (
        <div className="absolute left-4 right-4 top-16 z-20 rounded-md border border-line bg-panel/95 p-3 text-sm sm:left-auto sm:w-80">
          Your device looks too light for the Immersive view, so you are on the lighter map.{" "}
          <Link href={`/immersive?${cam ? cameraQuery(cam) + "&" : ""}force=1${carried}`} className="text-accent underline">
            Try Immersive anyway
          </Link>
        </div>
      )}

      <Ticker now={nowData} tick={tick} />
      <Attribution id={bm} cam={cam} className="absolute bottom-8 right-2 z-10 max-w-[60%]" />

      {!ion && ready && (
        <p className="absolute left-1/2 top-3 z-10 hidden -translate-x-1/2 rounded bg-panel/85 px-3 py-1 text-[11px] text-muted sm:block">
          No terrain source configured: flat ground at a fixed height.
        </p>
      )}
      {!ready && !error && <p className="absolute inset-0 z-10 grid place-items-center text-sm text-muted">Loading Glasgow&hellip;</p>}
      {error && <p className="absolute inset-0 z-10 grid place-items-center px-4 text-center text-sm text-red-300">{error}</p>}
    </div>
  );
}
