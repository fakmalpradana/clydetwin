// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { AerialPerspective, Atmosphere, Sky, SkyLight, SunLight } from "@takram/three-atmosphere/r3f";
import { GlobeControls, TilesPlugin, TilesRenderer } from "3d-tiles-renderer/r3f";
import { WGS84_ELLIPSOID, type TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { CesiumIonAuthPlugin, ImageOverlayPlugin, QuantizedMeshPlugin, XYZTilesOverlay } from "3d-tiles-renderer/plugins";
import { getBasemap, resolveTemplate, type BasemapId } from "@/lib/basemap";
import { ImplicitTilingPlugin } from "3d-tiles-renderer/core/plugins";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { BufferAttribute, type DirectionalLight, Group, Matrix4, Mesh, Quaternion, type PerspectiveCamera, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { withCamera, type CameraState } from "@/lib/camera";
import { stateToCamera, cameraToState } from "@/lib/three-camera";
import { effectiveStatus, type StationFeature } from "@/lib/api";
import { STATUS_COLOR } from "@/lib/status";
import { MODE_COLOR, project, type Vehicle } from "@/lib/vehicles";
import { filterIndex, LOD2_URL, loadPilotIds } from "@/lib/lod2";
import { cloudParams, type WeatherFx } from "@/lib/weatherfx";
import { QUALITY, type Quality } from "@/lib/quality";
import { FLAT_GROUND_M, GEORGE_SQUARE, ION_TOKEN, TERRAIN_URL, TILESET_URL } from "@/lib/tileset";

const ionArgs = {
  apiToken: ION_TOKEN,
  assetId: "1",
  autoRefreshToken: true,
  assetTypeHandler: (type: string, tiles: { registerPlugin: (p: unknown) => void }) => {
    if (type === "TERRAIN") tiles.registerPlugin(new QuantizedMeshPlugin({ useRecommendedSettings: true }));
  },
};

// Registered from the ref (synchronously, once per renderer): with <TilesPlugin> the plugin registered after the
// root layer.json load had started, so it never saw the layer and tiles never refined past level 0.
const registerOwnTerrain = (t: TilesRendererImpl | null) => {
  if (!t) return;
  if (!t.getPluginByName("QUANTIZED_MESH_PLUGIN")) t.registerPlugin(new QuantizedMeshPlugin({ useRecommendedSettings: true }));
  if (process.env.NEXT_PUBLIC_DEBUG_HOOKS === "1") (window as unknown as { __terrainTiles: unknown }).__terrainTiles = t;
};

const material = new MeshStandardMaterial({ color: "#b9bec7", roughness: 0.9, metalness: 0, flatShading: true });

const neutralize = (m: MeshStandardMaterial) => (e: { scene: Object3D }) =>
  e.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      mesh.material = m;
      mesh.castShadow = mesh.receiveShadow = true;
    }
  });
const onBuildings = neutralize(material);

type Metadata = { getPropertyTableData: (table: number, row: number) => { building_id?: string } };
/** LoD1 handler: grey material, and drop the triangles of buildings that the LoD2 pilot replaces. */
const onLod1 = (pilot: Set<string>) => (e: { scene: Object3D }) => {
  onBuildings(e);
  e.scene.traverse((o) => {
    const mesh = o as Mesh;
    const g = mesh.isMesh ? mesh.geometry : null;
    const fid = g?.getAttribute("_feature_id_0");
    const sm = (mesh.userData.structuralMetadata ?? e.scene.userData.structuralMetadata) as Metadata | undefined;
    if (!g || !fid || !sm || !g.index) return;
    const hidden = new Set<number>();
    for (const id of new Set(Array.from(fid.array as ArrayLike<number>))) {
      if (pilot.has(String(sm.getPropertyTableData(0, id).building_id))) hidden.add(id);
    }
    if (hidden.size) g.setIndex(new BufferAttribute(filterIndex(g.index.array, fid.array as ArrayLike<number>, hidden), 1));
  });
};
// Terrain keeps the material the quantized-mesh loader created: ImageOverlayPlugin wraps it to drape the basemap,
// and swapping in a shared material would drop that.
const onTerrain = (e: { scene: Object3D }) =>
  e.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      mesh.receiveShadow = true;
      const m = mesh.material as MeshStandardMaterial;
      m.roughness = 1;
      m.metalness = 0;
    }
  });

/** Place the camera from the shared state once, and publish its state (4 Hz) for the Explore switch + URL. */
function CameraSync({ initial, latestRef }: { initial: CameraState; latestRef: MutableRefObject<CameraState> }) {
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);
  // ponytail: debug hook (NEXT_PUBLIC_DEBUG_HOOKS=1) for terrain/alignment checks
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG_HOOKS === "1") (window as unknown as { __three: unknown }).__three = get();
  }, [get]);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => stateToCamera(initial, camera), [camera, initial]);
  // Match CesiumJS's default frustum (60 deg across the larger screen dimension) so both viewers frame alike.
  useEffect(() => {
    const cam = get().camera as PerspectiveCamera;
    cam.fov = aspect >= 1 ? (2 * Math.atan(Math.tan(Math.PI / 6) / aspect) * 180) / Math.PI : 60;
    cam.updateProjectionMatrix();
  }, [get, aspect]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (t.current < 0.25) return;
    t.current = 0;
    latestRef.current = cameraToState(camera);
    window.history.replaceState(null, "", withCamera(window.location.search, latestRef.current));
  });
  return null;
}

/** Drapes the chosen basemap on the terrain tiles as an XYZ image overlay (swapped when the basemap changes). */
function BasemapOverlay({ tiles, id }: { tiles: TilesRendererImpl | null; id: BasemapId }) {
  const gl = useThree((s) => s.gl);
  const plugin = useRef<ImageOverlayPlugin | null>(null);
  const overlay = useRef<XYZTilesOverlay | null>(null);
  useEffect(() => {
    if (!tiles) return;
    let cancelled = false;
    (async () => {
      const b = getBasemap(id);
      const { url, subdomains } = await resolveTemplate(b);
      if (cancelled) return;
      if (!plugin.current) {
        plugin.current = new ImageOverlayPlugin({ overlays: [], renderer: gl });
        tiles.registerPlugin(plugin.current);
      }
      if (overlay.current) plugin.current.deleteOverlay(overlay.current);
      // 3d-tiles-renderer has no {s} support: use the first subdomain.
      overlay.current = new XYZTilesOverlay({ url: url.replace("{s}", subdomains?.[0] ?? ""), levels: b.maxLevel + 1 });
      plugin.current.addOverlay(overlay.current);
    })().catch((e) => console.warn("basemap overlay failed", e));
    return () => {
      cancelled = true;
    };
  }, [tiles, id, gl]);
  return null;
}

/**
 * Moves the sun light (and its shadow frustum) to where the camera looks and sizes the frustum
 * to the view, so every visible building casts a shadow, not only a fixed box around George Square.
 */
// ponytail: one 4096² map stretched over the view (~1–3 m/texel when zoomed out); cascaded shadow maps if close-up quality matters.
function ShadowFollow({ groundRadius, children }: { groundRadius: number; children: ReactNode }) {
  const group = useRef<Group>(null);
  const dir = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const g = group.current;
    const light = g?.getObjectByProperty("isDirectionalLight", true) as DirectionalLight | undefined;
    if (!g || !light) return;
    // Intersect the view ray with a sphere at ground level; fall back to a point ahead when looking at the sky.
    const o = camera.position;
    camera.getWorldDirection(dir);
    const b = o.dot(dir);
    const disc = b * b - (o.lengthSq() - groundRadius * groundRadius);
    const t = disc > 0 ? -b - Math.sqrt(disc) : -1;
    const range = t > 0 ? Math.min(t, 8000) : 3000;
    g.position.copy(dir).multiplyScalar(range).add(o).setLength(groundRadius);
    const half = Math.min(Math.max(range * 1.5, 400), 8000);
    const cam = light.shadow.camera;
    cam.left = cam.bottom = -half;
    cam.right = cam.top = half;
    cam.updateProjectionMatrix();
  });
  return <group ref={group}>{children}</group>;
}

function Fps() {
  const acc = useRef({ frames: 0, last: 0 });
  useFrame(() => {
    const a = acc.current;
    const now = performance.now();
    a.frames++;
    if (now - a.last >= 1000) {
      (window as unknown as { __fps: number }).__fps = Math.round((a.frames * 1000) / (now - a.last));
      a.frames = 0;
      a.last = now;
    }
  });
  return null;
}

/** Volumetric clouds (takram), loaded on demand so the low preset never downloads them. Layer cover follows /now. */
function SceneClouds({ weather, quality }: { weather: WeatherFx | null; quality: "medium" | "high" }) {
  const [mod, setMod] = useState<typeof import("@takram/three-clouds/r3f") | null>(null);
  useEffect(() => {
    let alive = true;
    import("@takram/three-clouds/r3f").then((m) => alive && setMod(m));
    return () => { alive = false; };
  }, []);
  const p = useMemo(() => cloudParams(weather ?? { cloud_low: 30, cloud_mid: 20, cloud_high: 30 }), [weather]);
  if (!mod) return <></>;
  const { Clouds, CloudLayer } = mod;
  return (
    <Clouds
      disableDefaultLayers
      qualityPreset={quality}
      coverage={p.coverage}
      localWeatherTexture="/clouds/local_weather.png"
      shapeTexture="/clouds/shape.bin"
      shapeDetailTexture="/clouds/shape_detail.bin"
      turbulenceTexture="/clouds/turbulence.png"
    >
      {p.layers.map((l, i) => (
        <CloudLayer key={i} index={i} {...l} shadow />
      ))}
    </Clouds>
  );
}

/** Dev HUD (?hud=1): preset and fps, written to the page's #hud element. */
function Hud({ quality }: { quality: Quality }) {
  const acc = useRef({ frames: 0, last: 0 });
  useFrame(() => {
    const a = acc.current;
    const now = performance.now();
    a.frames++;
    if (!a.last) a.last = now;
    if (now - a.last >= 500) {
      const el = document.getElementById("hud");
      if (el) el.textContent = `quality: ${quality} | ${Math.round((a.frames * 1000) / (now - a.last))} fps`;
      a.frames = 0;
      a.last = now;
    }
  });
  return null;
}

/** Flat disc tangent to the ellipsoid at FLAT_GROUND_M, used when no ion terrain is available. */
function GroundPlane() {
  const m = useMemo(
    () =>
      WGS84_ELLIPSOID.getEastNorthUpFrame(
        (GEORGE_SQUARE.lat * Math.PI) / 180,
        (GEORGE_SQUARE.lon * Math.PI) / 180,
        FLAT_GROUND_M,
        new Matrix4(),
      ),
    [],
  );
  return (
    <mesh matrixAutoUpdate={false} matrix={m} receiveShadow>
      <circleGeometry args={[4000, 64]} />
      <meshStandardMaterial color="#2b313b" roughness={1} />
    </mesh>
  );
}

/**
 * Far-field ground: a spherical cap (80 km) just below sea level, under our terrain. The terrain data ends at the AOI
 * edge (~13 km out), and without this its stepped far edge showed as a dashed line against the sky.
 */
function FarGround({ anchor }: { anchor: Vector3 }) {
  const q = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), anchor.clone().normalize()), [anchor]);
  const r = anchor.length() - FLAT_GROUND_M + 45;
  return (
    <mesh quaternion={q}>
      <sphereGeometry args={[r, 64, 48, 0, Math.PI * 2, 0, 80000 / r]} />
      <meshStandardMaterial color="#3a4048" roughness={1} />
    </mesh>
  );
}

/**
 * River gauges as a pole with a coloured ball, standing on the FLAT_GROUND_M plane (ellipsoidal metres) like the
 * ground fallback; the poles are tall enough to read from the default camera and to stay visible over our own terrain.
 */
function Gauges({ stations, tick }: { stations: StationFeature[]; tick: number }) {
  const items = useMemo(
    () =>
      stations
        .filter((f) => f.properties.kind === "river_level")
        .map((f) => ({
          id: f.properties.id,
          color: STATUS_COLOR[effectiveStatus(f.properties, tick)],
          matrix: WGS84_ELLIPSOID.getEastNorthUpFrame(
            (f.geometry.coordinates[1] * Math.PI) / 180,
            (f.geometry.coordinates[0] * Math.PI) / 180,
            FLAT_GROUND_M,
            new Matrix4(),
          ),
        })),
    [stations, tick],
  );
  return (
    <>
      {items.map((g) => (
        <group key={g.id} matrixAutoUpdate={false} matrix={g.matrix}>
          {/* local z is up; cylinder axis is y, so rotate */}
          <mesh position={[0, 0, 15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[1.2, 1.2, 30, 8]} />
            <meshBasicMaterial color="#e6e9ef" />
          </mesh>
          <mesh position={[0, 0, 36]}>
            <sphereGeometry args={[7, 20, 14]} />
            <meshBasicMaterial color={g.color} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * Aircraft and Subway trains from lib/vehicles, moved every frame by dead reckoning. Simple primitives, drawn about
 * 2x real size so they read from the default camera; colour is the mode. ENU frame: x east, y north, z up, nose along +y.
 */
function Vehicles({ vehicles }: { vehicles: Vehicle[] }) {
  const groups = useRef(new Map<string, Group>());
  const latest = useRef(vehicles);
  useEffect(() => { latest.current = vehicles; }, [vehicles]);
  const tmp = useMemo(() => ({ m: new Matrix4(), r: new Matrix4() }), []);
  useFrame(({ camera, size }) => {
    const now = Date.now();
    const wpp = (2 * Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360)) / size.height; // world m per pixel, per metre of distance
    for (const v of latest.current) {
      const g = groups.current.get(v.id);
      if (!g) continue;
      const p = project(v, now);
      WGS84_ELLIPSOID.getEastNorthUpFrame((p.lat * Math.PI) / 180, (p.lon * Math.PI) / 180, p.h, tmp.m);
      // Keep at least ~24 px long on screen so vehicles stay visible at city scale.
      const k = Math.max(1, (24 * wpp * camera.position.distanceTo(g.position.setFromMatrixPosition(tmp.m))) / (v.kind === "aircraft" ? 60 : 28));
      g.matrix.copy(tmp.m.multiply(tmp.r.makeRotationZ(v.heading_deg == null ? 0 : (-v.heading_deg * Math.PI) / 180)).scale(g.scale.set(k, k, k)));
      g.matrixWorldNeedsUpdate = true;
      g.visible = true;
    }
  });
  return (
    <>
      {vehicles.map((v) => (
        <group key={v.id} ref={(g) => { if (g) { g.visible = false; groups.current.set(v.id, g); } else groups.current.delete(v.id); }} matrixAutoUpdate={false}>
          {v.kind === "aircraft" ? (
            <>
              <mesh position={[0, 0, 0]}><boxGeometry args={[9, 60, 9]} /><meshBasicMaterial color={MODE_COLOR[v.mode]} /></mesh>
              <mesh position={[0, 4, 0]}><boxGeometry args={[56, 12, 2]} /><meshBasicMaterial color={MODE_COLOR[v.mode]} /></mesh>
              <mesh position={[0, -26, 3]}><boxGeometry args={[20, 7, 2]} /><meshBasicMaterial color={MODE_COLOR[v.mode]} /></mesh>
            </>
          ) : (
            // trains run underground: drawn over the terrain so they stay visible
            <mesh position={[0, 0, 6]} renderOrder={2}><boxGeometry args={[9, 28, 8]} /><meshBasicMaterial color={MODE_COLOR[v.mode]} depthTest={false} /></mesh>
          )}
        </group>
      ))}
    </>
  );
}

export default function ImmersiveScene({
  initial,
  date,
  basemap,
  latestRef,
  stations,
  tick,
  vehicles,
  quality,
  hud,
  weather,
}: {
  weather: WeatherFx | null;
  quality: Quality;
  hud: boolean;
  vehicles: Vehicle[];
  stations: StationFeature[];
  tick: number;
  initial: CameraState;
  date: Date;
  basemap: BasemapId;
  latestRef: MutableRefObject<CameraState>;
}) {
  const [world, setWorld] = useState<Group | null>(null);
  const [terrainTiles, setTerrainTiles] = useState<TilesRendererImpl | null>(null);
  const ownTerrainRef = useCallback((t: TilesRendererImpl | null) => {
    registerOwnTerrain(t);
    setTerrainTiles(t);
  }, []);
  const anchor = useMemo(
    () =>
      WGS84_ELLIPSOID.getCartographicToPosition(
        (GEORGE_SQUARE.lat * Math.PI) / 180,
        (GEORGE_SQUARE.lon * Math.PI) / 180,
        FLAT_GROUND_M,
        new Vector3(),
      ),
    [],
  );
  const qs = QUALITY[quality];
  const cloudsOn = qs.clouds !== false;
  const hasIon = ION_TOKEN.length > 0;
  // LoD1 waits for the pilot id list so its tiles are never drawn without the hole.
  const [pilot, setPilot] = useState<Set<string> | null | "failed">(null);
  useEffect(() => {
    loadPilotIds().then(setPilot, (e) => { console.warn("LoD2 pilot unavailable", e); setPilot("failed"); });
  }, []);
  const lod1Handler = useMemo(() => (pilot && pilot !== "failed" ? onLod1(pilot) : onBuildings), [pilot]);
  return (
    <Canvas
      shadows="percentage"
      gl={{ antialias: false, depth: false, stencil: false, powerPreference: "high-performance" }}
      camera={{ fov: 55, near: 1, far: 1e7 }}
      dpr={qs.dpr}
    >
      <Atmosphere date={date}>
        <Sky />
        <ShadowFollow groundRadius={anchor.length()}>
          <SkyLight />
          <SunLight
            castShadow
            distance={10000}
            shadow-mapSize={[qs.shadowMap, qs.shadowMap]}
            shadow-camera-near={1}
            shadow-camera-far={20000}
            shadow-bias={-0.0004}
            shadow-normalBias={1}
          />
        </ShadowFollow>
        <group ref={setWorld}>
          {pilot && (
            <TilesRenderer key={pilot === "failed" ? "lod1" : "lod1-hole"} url={TILESET_URL} onLoadModel={lod1Handler}>
              {/* the sample/prod tileset is 3D Tiles 1.1 implicit; the plugin is not on by default */}
              <TilesPlugin plugin={ImplicitTilingPlugin} />
              {world && <GlobeControls scene={world} enableDamping />}
            </TilesRenderer>
          )}
          {pilot && pilot !== "failed" && (
            <TilesRenderer url={LOD2_URL} onLoadModel={onBuildings}>
              <TilesPlugin plugin={ImplicitTilingPlugin} />
            </TilesRenderer>
          )}
          {TERRAIN_URL ? (
            // Our own quantized-mesh terrain (no ion auth). Outside its extent there is simply no ground.
            <TilesRenderer ref={ownTerrainRef} key="own-terrain" url={TERRAIN_URL} onLoadModel={onTerrain} />
          ) : hasIon ? (
            // Cesium World Terrain (ion asset 1); the ion plugin registers the quantized-mesh plugin once it sees TERRAIN.
            <TilesRenderer ref={setTerrainTiles} key="terrain" onLoadModel={onTerrain}>
              <TilesPlugin plugin={CesiumIonAuthPlugin} args={[ionArgs]} />
            </TilesRenderer>
          ) : (
            <GroundPlane />
          )}
        </group>
        {TERRAIN_URL && <FarGround anchor={anchor} />}
        <Gauges stations={stations} tick={tick} />
        <Vehicles vehicles={vehicles} />
        <BasemapOverlay tiles={terrainTiles} id={basemap} />
        <CameraSync initial={initial} latestRef={latestRef} />
        <Fps />
        {hud && <Hud quality={quality} />}
        <EffectComposer multisampling={0} enableNormalPass={cloudsOn}>
          {cloudsOn && <SceneClouds weather={weather} quality={qs.clouds as "medium" | "high"} />}
          <AerialPerspective />
          {qs.smaa ? <SMAA /> : <></>}
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      </Atmosphere>
    </Canvas>
  );
}
