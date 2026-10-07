// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, Matrix4, MeshStandardMaterial, RepeatWrapping, Vector2, Vector3 } from "three";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import { buildWater, WATER_URL, type WaterMesh } from "@/lib/water";
import { GEORGE_SQUARE } from "@/lib/tileset";
import type { Quality } from "@/lib/quality";
import { sunElevation } from "@/lib/time";
import { rippleParams, skyTint, sunGlint } from "@/lib/waterfx";
import type { WeatherFx } from "@/lib/weatherfx";
import { makeWater, updateWater } from "./waterMesh";

const RAD = Math.PI / 180;

/** Tileable ripple normal map from a few summed sines (no texture file). */
function rippleNormals(size = 256) {
  const h = new Float32Array(size * size);
  const w = [[1, 2, 0.5], [3, 1, 0.3], [2, 5, 0.2], [6, 3, 0.1]];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      h[y * size + x] = w.reduce((s, [kx, ky, a], i) => s + a * Math.sin((2 * Math.PI * (kx * x + ky * y)) / size + i * 1.7), 0);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
      const l = Math.hypot(dx * 6, dy * 6, 1);
      img.data.set([((-dx * 6) / l) * 127 + 128, ((-dy * 6) / l) * 127 + 128, (1 / l) * 127 + 128, 255], (y * size + x) * 4);
    }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/**
 * The River Clyde as a thin lit surface at height `h` (ellipsoidal m): triangles from the OS OpenMap Local polygons,
 * vertices relative to a George Square anchor (float32-safe), a scrolling ripple normal map and low roughness so the
 * sun glints on it. Reflections of the sky are not modelled.
 */
export default function Water({ h, quality, weather, date }: { h: number; quality: Quality; weather: WeatherFx | null; date: Date }) {
  const [mesh, setMesh] = useState<WaterMesh | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(WATER_URL)
      .then((r) => r.json())
      .then((fc: { features: { geometry: { coordinates: [number, number][][] } }[] }) => alive && setMesh(buildWater(fc.features.map((f) => f.geometry))))
      .catch((e) => console.warn("water polygons unavailable", e));
    return () => { alive = false; };
  }, []);
  if (!mesh) return null;
  return quality === "low" ? <SimpleWater mesh={mesh} h={h} /> : <FlowWater mesh={mesh} h={h} quality={quality} weather={weather} date={date} />;
}

/** Flow-map water (medium) with a planar reflection (high): see waterMesh.ts. */
function FlowWater({ mesh, h, quality, weather, date }: { mesh: WaterMesh; h: number; quality: "medium" | "high"; weather: WeatherFx | null; date: Date }) {
  const size = useThree((s) => s.size);
  const frame = useMemo(() => WGS84_ELLIPSOID.getEastNorthUpFrame(GEORGE_SQUARE.lat * RAD, GEORGE_SQUARE.lon * RAD, h, new Matrix4()), [h]);
  const reflW = Math.min(1024, Math.round(size.width / 2));
  const water = useMemo(
    () => makeWater(mesh, frame, h, quality, new Vector2(reflW, Math.round((reflW * size.height) / size.width))),
    [mesh, frame, h, quality, reflW, size.height, size.width],
  );
  useEffect(() => () => water.dispose(), [water]);
  const env = useMemo(() => {
    const el = sunElevation(date);
    const cloud = weather ? (weather.cloud_low + weather.cloud_mid + weather.cloud_high) / 3 : 30;
    return { sky: skyTint(el, cloud), sun: sunGlint(el, cloud) };
  }, [date, weather]);
  const look = useMemo(() => rippleParams(weather?.wind_ms ?? 3, weather?.precip_mm ?? 0), [weather]);
  useFrame(({ clock, scene, camera }) => updateWater(water, { time: clock.elapsedTime, ...look, ...env }, scene, camera));
  return <primitive object={water.mesh} />;
}

function SimpleWater({ mesh, h }: { mesh: WaterMesh; h: number }) {
  const anchor = useMemo(() => WGS84_ELLIPSOID.getCartographicToPosition(GEORGE_SQUARE.lat * RAD, GEORGE_SQUARE.lon * RAD, h, new Vector3()), [h]);
  const matrix = useMemo(() => new Matrix4().makeTranslation(anchor), [anchor]);
  const geometry = useMemo(() => {
    if (!mesh) return null;
    const n = mesh.xy.length / 2;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const p = new Vector3();
    for (let i = 0; i < n; i++) {
      const lon = mesh.xy[2 * i], lat = mesh.xy[2 * i + 1];
      WGS84_ELLIPSOID.getCartographicToPosition(lat * RAD, lon * RAD, h, p);
      nor.set(p.clone().normalize().toArray(), i * 3);
      pos.set(p.sub(anchor).toArray(), i * 3);
      uv.set([((lon - GEORGE_SQUARE.lon) * 62500) / 130, ((lat - GEORGE_SQUARE.lat) * 111200) / 130], i * 2);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("normal", new BufferAttribute(nor, 3));
    g.setAttribute("uv", new BufferAttribute(uv, 2));
    g.setIndex(mesh.index);
    return g;
  }, [mesh, h, anchor]);
  const material = useMemo(() => {
    const normalMap = rippleNormals();
    normalMap.repeat.set(1, 1);
    return new MeshStandardMaterial({
      color: "#16323f", roughness: 0.08, metalness: 0.3, normalMap, transparent: true, opacity: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }, []);
  useFrame((_, dt) => {
    const o = material.normalMap?.offset;
    if (o) o.set(o.x + dt * 0.012, o.y + dt * 0.007);
  });
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} matrix={matrix} matrixAutoUpdate={false} receiveShadow frustumCulled={false} renderOrder={1} />;
}
