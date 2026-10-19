// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { AerialPerspective, Atmosphere, Sky, SkyLight, SunLight } from "@takram/three-atmosphere/r3f";
import { GlobeControls, TilesPlugin, TilesRenderer } from "3d-tiles-renderer/r3f";
import { WGS84_ELLIPSOID, type TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { CesiumIonAuthPlugin, ImageOverlayPlugin, QuantizedMeshPlugin, XYZTilesOverlay } from "3d-tiles-renderer/plugins";
import { getBasemap, resolveTemplate, type BasemapId } from "@/lib/basemap";
import { ImplicitTilingPlugin } from "3d-tiles-renderer/core/plugins";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { type DirectionalLight, Group, Matrix4, Mesh, type PerspectiveCamera, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { withCamera, type CameraState } from "@/lib/camera";
import { stateToCamera, cameraToState } from "@/lib/three-camera";
import { effectiveStatus, type StationFeature } from "@/lib/api";
import { STATUS_COLOR } from "@/lib/status";
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

export default function ImmersiveScene({
  initial,
  date,
  basemap,
  latestRef,
  stations,
  tick,
}: {
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
  const hasIon = ION_TOKEN.length > 0;
  return (
    <Canvas
      shadows="percentage"
      gl={{ antialias: false, depth: false, stencil: false, powerPreference: "high-performance" }}
      camera={{ fov: 55, near: 1, far: 1e7 }}
      dpr={[1, 1.5]}
    >
      <Atmosphere date={date}>
        <Sky />
        <ShadowFollow groundRadius={anchor.length()}>
          <SkyLight />
          <SunLight
            castShadow
            distance={10000}
            shadow-mapSize={[4096, 4096]}
            shadow-camera-near={1}
            shadow-camera-far={20000}
            shadow-bias={-0.0004}
            shadow-normalBias={1}
          />
        </ShadowFollow>
        <group ref={setWorld}>
          <TilesRenderer url={TILESET_URL} onLoadModel={onBuildings}>
            {/* the sample/prod tileset is 3D Tiles 1.1 implicit; the plugin is not on by default */}
            <TilesPlugin plugin={ImplicitTilingPlugin} />
            {world && <GlobeControls scene={world} enableDamping />}
          </TilesRenderer>
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
        <Gauges stations={stations} tick={tick} />
        <BasemapOverlay tiles={terrainTiles} id={basemap} />
        <CameraSync initial={initial} latestRef={latestRef} />
        <Fps />
        <EffectComposer multisampling={0}>
          <AerialPerspective />
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      </Atmosphere>
    </Canvas>
  );
}
