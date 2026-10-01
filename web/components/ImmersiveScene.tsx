// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { AerialPerspective, Atmosphere, Sky, SkyLight, SunLight } from "@takram/three-atmosphere/r3f";
import { GlobeControls, TilesPlugin, TilesRenderer } from "3d-tiles-renderer/r3f";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import { CesiumIonAuthPlugin, QuantizedMeshPlugin } from "3d-tiles-renderer/plugins";
import { ImplicitTilingPlugin } from "3d-tiles-renderer/core/plugins";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Group, Matrix4, Mesh, type PerspectiveCamera, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { withCamera, type CameraState } from "@/lib/camera";
import { stateToCamera, cameraToState } from "@/lib/three-camera";
import { FLAT_GROUND_M, GEORGE_SQUARE, ION_TOKEN, TILESET_URL } from "@/lib/tileset";

const material = new MeshStandardMaterial({ color: "#b9bec7", roughness: 0.9, metalness: 0, flatShading: true });
const terrainMaterial = new MeshStandardMaterial({ color: "#2a2f38", roughness: 1, metalness: 0 });

const neutralize = (m: MeshStandardMaterial) => (e: { scene: Object3D }) =>
  e.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      mesh.material = m;
      mesh.castShadow = mesh.receiveShadow = true;
    }
  });
const onBuildings = neutralize(material);
const onTerrain = neutralize(terrainMaterial);

/** Place the camera from the shared state once, and publish its state (4 Hz) for the Explore switch + URL. */
function CameraSync({ initial, latestRef }: { initial: CameraState; latestRef: MutableRefObject<CameraState> }) {
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);
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

export default function ImmersiveScene({
  initial,
  date,
  latestRef,
}: {
  initial: CameraState;
  date: Date;
  latestRef: MutableRefObject<CameraState>;
}) {
  const [world, setWorld] = useState<Group | null>(null);
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
        <group position={anchor}>
          <SkyLight />
          <SunLight
            castShadow
            distance={3000}
            shadow-mapSize={[4096, 4096]}
            shadow-camera-left={-700}
            shadow-camera-right={700}
            shadow-camera-top={700}
            shadow-camera-bottom={-700}
            shadow-camera-near={100}
            shadow-camera-far={6000}
            shadow-bias={-0.0004}
          />
        </group>
        <group ref={setWorld}>
          <TilesRenderer url={TILESET_URL} onLoadModel={onBuildings}>
            {/* the sample/prod tileset is 3D Tiles 1.1 implicit; the plugin is not on by default */}
            <TilesPlugin plugin={ImplicitTilingPlugin} />
            {world && <GlobeControls scene={world} enableDamping />}
          </TilesRenderer>
          {hasIon ? (
            // ponytail: untested until a Cesium ion token exists (asset 1 = Cesium World Terrain).
            <TilesRenderer key="terrain" onLoadModel={onTerrain}>
              <TilesPlugin plugin={CesiumIonAuthPlugin} args={[{ apiToken: ION_TOKEN, assetId: "1", autoRefreshToken: true }]} />
              <TilesPlugin plugin={QuantizedMeshPlugin} args={[{ useRecommendedSettings: true }]} />
            </TilesRenderer>
          ) : (
            <GroundPlane />
          )}
        </group>
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
