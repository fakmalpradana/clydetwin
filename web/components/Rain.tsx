// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Matrix4, ShaderMaterial, Vector3 } from "three";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";

const N = 9000; // streaks at full intensity
const R = 60; // half-size of the rain box around the camera, m
const SPEED = 9; // m/s, scaled up so it reads from a city-scale camera

function makeRain() {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = new Float32Array(N * 2 * 3);
  const end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (rand() * 2 - 1) * R, y = (rand() * 2 - 1) * R, z = (rand() * 2 - 1) * R;
    pos.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("tail", new BufferAttribute(end, 1));
  const m = new ShaderMaterial({
    uniforms: { time: { value: 0 }, alpha: { value: 0 }, lean: { value: 0 } },
    vertexShader: `
      uniform float time; uniform float lean; attribute float tail; varying float vT;
      void main() {
        vec3 p = position;
        p.z = mod(p.z - time * ${SPEED.toFixed(1)} + ${R.toFixed(1)}, ${(2 * R).toFixed(1)}) - ${R.toFixed(1)};
        p.x += tail * lean * 2.5 + (position.z - p.z) * lean * 0.2; // streak leans into the wind
        p.z += tail * 2.5;
        vT = 1.0 - tail;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float alpha; varying float vT; void main() { gl_FragColor = vec4(0.72, 0.8, 0.9, alpha * vT); }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return { geometry: g, material: m };
}

function step(material: ShaderMaterial, geometry: BufferGeometry, t: number, intensity: number, wind: number) {
  material.uniforms.time.value = t;
  material.uniforms.alpha.value = 0.12 + 0.3 * intensity;
  material.uniforms.lean.value = Math.min(1, wind / 15);
  geometry.setDrawRange(0, Math.ceil(N * intensity) * 2);
}

/**
 * GPU rain: a box of streaks that follows the camera, in the camera's local east/north/up frame (so float32 stays precise
 * in the ECEF world). The vertex shader does the falling; `intensity` (0-1) sets how many streaks are drawn and their alpha.
 */
export default function Rain({ intensity, wind }: { intensity: number; wind: number }) {
  const group = useRef<Group>(null);
  const { geometry, material } = useMemo(() => makeRain(), []);
  const m = useMemo(() => new Matrix4(), []);
  const p = useMemo(() => new Vector3(), []);
  useFrame(({ camera, clock }) => {
    const g = group.current;
    if (!g) return;
    p.setFromMatrixPosition(camera.matrixWorld);
    const c = WGS84_ELLIPSOID.getPositionToCartographic(p, { lat: 0, lon: 0, height: 0 });
    WGS84_ELLIPSOID.getEastNorthUpFrame(c.lat, c.lon, c.height, m);
    g.matrix.copy(m);
    g.matrixWorldNeedsUpdate = true;
    step(material, geometry, clock.elapsedTime, intensity, wind);
  });
  if (intensity <= 0) return null;
  return (
    <group ref={group} matrixAutoUpdate={false}>
      <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
