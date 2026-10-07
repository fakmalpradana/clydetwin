// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FLOOD_CAMERA, carry, cameraQuery, paramsToCamera, setParam, withCamera, type CameraState } from "@/lib/camera";
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
import { BUILDING_FIELDS, type BuildingProps } from "@/lib/tileset";
import { analyticsRows, parseTheme, type ThemeId } from "@/lib/themes";
import { loadPilotIds } from "@/lib/lod2";
import FloodPanel from "./FloodPanel";
import ThemeLegend from "./ThemeLegend";
import { ZoneControls, ZonePanel } from "./ZoneLegend";
import type { ZoneMode, ZoneProps } from "@/lib/zones";
import type * as CesiumNS from "cesium";

type CesiumLib = typeof import("@/lib/cesium");

const glasgowTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(d);

const fmt = (v: unknown, unit?: string) => {
  if (typeof v === "number") return `${Number.isInteger(v) ? v : v.toFixed(2)}${unit ? " " + unit : ""}`;
  return String(v ?? "-");
};

export default function Explore({ scenario }: { scenario?: "flood" }) {
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<{
    lib: CesiumLib;
    viewer: CesiumNS.Viewer;
    tileset: CesiumNS.Cesium3DTileset;
    lod2?: CesiumNS.Cesium3DTileset;
    zones?: CesiumNS.GeoJsonDataSource;
    ionTerrain?: CesiumNS.TerrainProvider;
    flood?: CesiumNS.ImageryLayer;
  } | null>(null);
  const { stations, now: nowData, tick } = useConditions();
  const [flood, setFlood] = useState(!!scenario);
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
  const [theme, setTheme] = useState<ThemeId>("height");
  const [lod2, setLod2] = useState(true);
  const [pilotIds, setPilotIds] = useState<Set<string> | null>(null);
  const [lod2Err, setLod2Err] = useState(false);
  const [zonesOn, setZonesOn] = useState(false);
  const [zonesErr, setZonesErr] = useState(false);
  const [zoneMode, setZoneMode] = useState<ZoneMode>("simd");
  const [zone, setZone] = useState<ZoneProps | null>(null);
  const mobility = useMobility(useCallback(() => api.current, []), ready);

  useEffect(() => {
    let disposed = false;
    const q = new URLSearchParams(window.location.search);
    (async () => {
      const lib = await import("@/lib/cesium");
      if (disposed || !container.current) return;
      setLowGpu(q.get("gpu") === "low");
      setBm(parseBasemap(q));
      setTheme(parseTheme(q, scenario ? "flood" : "height"));
      setZonesOn(q.get("zones") === "1");
      setZoneMode(q.get("zm") === "density" ? "density" : "simd");
      setLod2(q.get("lod2") !== "0");
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
      lib.setCamera(viewer, paramsToCamera(q, scenario ? FLOOD_CAMERA : undefined));
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
        const ent = picked?.id instanceof C.Entity ? picked.id : null;
        const zp = ent?.properties?.dz22 ? (ent.properties.getValue(C.JulianDate.now()) as ZoneProps) : null;
        if (zp) {
          setSelected(null);
          setGaugeId(null);
          setZone(zp);
          return;
        }
        setZone(null);
        const gid = ent ? ent.id : null;
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
      Promise.all([lib.loadLod2(viewer), loadPilotIds()]).then(
        ([t, ids]) => {
          if (disposed) return;
          if (api.current) api.current.lod2 = t;
          setPilotIds(ids);
        },
        (e) => { console.warn("LoD2 pilot unavailable", e); setLod2Err(true); },
      );
    })().catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      api.current?.viewer.destroy();
      api.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- scenario is a fixed prop
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

  // LoD2 replaces LoD1 inside the pilot, but only in the height theme: its tiles carry no analytics attributes.
  const showLod2 = lod2 && theme === "height" && !!pilotIds;
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.tileset.style = a.lib.buildingStyle(theme, showLod2 ? pilotIds! : undefined);
    if (a.lod2) a.lod2.show = showLod2 && buildings;
  }, [theme, ready, showLod2, pilotIds, buildings]);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (!zonesOn) { if (a.zones) a.zones.show = false; return; }
    if (a.zones) { a.zones.show = true; return; }
    a.lib.loadZones(zoneMode).then((ds) => {
      a.zones = ds;
      a.viewer.dataSources.add(ds);
    }, (e) => { console.warn("Data Zones failed", e); setZonesErr(true); setZonesOn(false); });
    // zoneMode is applied by the effect below; only the first load reads it here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesOn, ready]);

  useEffect(() => {
    const a = api.current;
    if (a?.zones) a.lib.restyleZones(a.zones, zoneMode);
  }, [zoneMode, zonesOn]);

  useEffect(() => {
    if (api.current) api.current.tileset.show = buildings;
  }, [buildings, ready]);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.viewer.terrainProvider = terrain && a.ionTerrain ? a.ionTerrain : a.lib.flatTerrain();
  }, [terrain, ready]);

  const setZones = (v: boolean) => {
    setZonesErr(false);
    setZonesOn(v);
    if (!v) setZone(null);
    window.history.replaceState(null, "", setParam(window.location.search, "zones", v ? "1" : "0"));
  };
  const changeZoneMode = (m: ZoneMode) => {
    setZoneMode(m);
    window.history.replaceState(null, "", setParam(window.location.search, "zm", m));
  };
  const changeTheme = (t: ThemeId) => {
    setTheme(t);
    window.history.replaceState(null, "", setParam(window.location.search, "theme", t));
  };
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
        {!scenario && <label className="flex items-center gap-2 py-1" title="George Square and Merchant City, roofer LoD2.2">
          <input type="checkbox" checked={lod2} disabled={!pilotIds} onChange={(e) => { setLod2(e.target.checked); window.history.replaceState(null, "", setParam(window.location.search, "lod2", e.target.checked ? "1" : "0")); }} /> LoD2 pilot{lod2Err ? " (unavailable)" : ""}
        </label>}
        {!scenario && lod2 && pilotIds && theme !== "height" && <p className="text-[10px] text-muted">LoD2 is shown in the Height theme only; it has no analytics attributes.</p>}
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
        <ZoneControls on={zonesOn} mode={zoneMode} error={zonesErr} onOn={setZones} onMode={changeZoneMode} />
        <div className="mt-3"><ThemeLegend theme={theme} onChange={changeTheme} /></div>
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
      {zone && <ZonePanel z={zone} onClose={() => setZone(null)} />}

      {selected && (
        <section className="absolute z-20 bottom-0 left-0 right-0 max-h-[55dvh] overflow-auto border-t border-line bg-panel/95 p-4 backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-16 sm:w-80 sm:rounded-lg sm:border">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Building</h2>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-fg" aria-label="Close panel">&times;</button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <div className="contents"><dt className="text-muted">Model</dt><dd className="text-right font-mono text-xs leading-5">{(selected as { lod?: number }).lod === 2 ? "LoD2 (pilot)" : "LoD1"}</dd></div>
            {BUILDING_FIELDS.filter((f) => f.key !== "h_p90" || selected.h_p90 !== undefined).map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-muted">{f.label}</dt>
                <dd className="break-all text-right font-mono text-xs leading-5">{fmt(selected[f.key], f.unit)}</dd>
              </div>
            ))}
          </dl>
          {analyticsRows(selected as unknown as Record<string, unknown>).length > 0 && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm">
              {analyticsRows(selected as unknown as Record<string, unknown>).map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="text-right font-mono text-xs leading-5">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] text-muted">
            <li>LoD1 block height (70th percentile); towers are shown fully in the LoD2 pilot.</li>
            <li>Storeys are an estimate (height / 3 m), not a count. Volume is footprint area x height.</li>
            <li>EPC covers domestic certificates only. &quot;No data&quot; means nothing on record, not a good or bad result.</li>
            <li>Flood: SEPA indicative likelihood; &quot;not mapped&quot; is not a guarantee of safety.</li>
            <li>Noise: strategic map for planning, not for property enquiries.</li>
          </ul>
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

      {scenario === "flood" && <FloodPanel />}
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
