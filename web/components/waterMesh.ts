// SPDX-License-Identifier: AGPL-3.0-or-later
// The Clyde water as one mesh in the local east/north/up frame at an anchor: a flow-map shader (two scrolling normal
// maps blended over two half-phase offsets, Vlachos-style), Fresnel between a murky body colour and the sky, a sun glint,
// and on `high` a planar reflection through three's Reflector (the plane is the tangent plane at the anchor).
import { BufferAttribute, BufferGeometry, Camera, DirectionalLight, type Matrix4, Mesh, type Object3D, RepeatWrapping, ShaderMaterial, TextureLoader, Vector2, Vector3, type Texture } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import { ALPHA_DEEP, ALPHA_SHALLOW, DEPTH_SCALE_M, flowAt, FOAM_WIDTH_M, WATER_DEEP, WATER_SHALLOW } from "@/lib/waterfx";
import type { WaterMesh } from "@/lib/water";

const RAD = Math.PI / 180;

const vertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  attribute vec2 aFlow;
  attribute float aBank;
  varying float vBank;
  varying vec2 vLocal;
  varying vec2 vFlow;
  varying vec3 vView;
  varying vec3 vUp;
  varying vec4 vProj;
  void main() {
    vLocal = position.xy;
    vFlow = aFlow;
    vBank = aBank;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    vUp = normalMatrix * vec3(0.0, 0.0, 1.0);
    vProj = textureMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tN1; uniform sampler2D tN2; uniform sampler2D tDiffuse;
  uniform float time; uniform float speed; uniform float strength; uniform float fine;
  uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun; uniform vec3 uSunView;
  uniform vec3 color;
  uniform float uScale; uniform float uFoamW; uniform float uAShallow; uniform float uADeep;
  varying float vBank;
  varying vec2 vLocal; varying vec2 vFlow; varying vec3 vView; varying vec3 vUp; varying vec4 vProj;
  // two-phase flow sampling: each layer is advected by the flow and re-seeded every cycle, cross-faded to hide the reset
  vec3 flowSample(sampler2D t, vec2 uv, vec2 flow, float tt) {
    float pa = fract(tt), pb = fract(tt + 0.5);
    float w = abs(pa * 2.0 - 1.0);
    vec3 a = texture2D(t, uv - flow * pa * 0.35).xyz * 2.0 - 1.0;
    vec3 b = texture2D(t, uv - flow * pb * 0.35 + 0.37).xyz * 2.0 - 1.0;
    return mix(a, b, w);
  }
  void main() {
    float tt = time * speed * 0.12;
    vec2 fl = vFlow * 0.5;
    vec3 n1 = flowSample(tN1, vLocal / 28.0, fl, tt);
    vec3 n2 = flowSample(tN2, vLocal / 11.0 + vec2(0.13, 0.31), fl * 1.6, tt * 1.3);
    vec3 n3 = texture2D(tN2, vLocal / 2.3 + vec2(time * 0.05, -time * 0.07)).xyz * 2.0 - 1.0;
    vec2 xy = (n1.xy * 0.55 + n2.xy * 0.45) * strength + n3.xy * fine * 0.5;
    // tangent-frame normal (east, north, up) to view space via the up vector and screen-space derivatives
    vec3 up = normalize(vUp);
    vec3 v = normalize(vView);
    vec3 dpx = dFdx(vView), dpy = dFdy(vView);
    vec3 t1 = normalize(cross(dpy, up)); // ~east-ish, perpendicular to up
    vec3 t2 = cross(up, t1);
    vec3 n = normalize(up + t1 * xy.x + t2 * xy.y);
    float ndv = max(dot(n, v), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    fresnel = clamp(fresnel * 1.0 + 0.04, 0.0, 1.0);
    // depth proxy from the distance to the bank (see lib/waterfx.ts): light translucent shallows, dark near-opaque channel
    float depth = 1.0 - exp(-vBank / uScale);
    float dt = smoothstep(0.0, 1.0, depth);
    float murk = 0.5 + 0.5 * (n1.x * 0.5 + n2.y * 0.5);
    vec3 body = mix(uShallow, uDeep, clamp(dt + (murk - 0.5) * 0.12, 0.0, 1.0)) + uSky * 0.03;
    // no reflection pass: sky gradient along the reflected ray (bright at the horizon, deeper overhead), so ripples show
    vec3 rv = reflect(-v, n);
    float upness = clamp(dot(rv, up), 0.0, 1.0);
    vec3 refl = mix(uSky * 1.6, uSky * 0.55, sqrt(upness));
    #ifdef USE_REFLECTION
      vec2 uvp = vProj.xy / vProj.w + xy * 0.04;
      refl = texture2D(tDiffuse, uvp).rgb;
    #endif
    float spec = pow(max(dot(reflect(-uSunView, n), v), 0.0), 220.0);
    vec3 col = mix(body, refl, fresnel) + uSun * spec;
    // shoreline: thin bright band at the polygon edge, breathing with the flow time and broken up by the fine normals
    float fw = uFoamW * (1.0 + 0.25 * sin(tt * 6.2832 * 4.0 + vLocal.x * 0.05)) * (0.8 + 0.4 * (n3.x * 0.5 + 0.5));
    float foam = 1.0 - smoothstep(fw * 0.4, fw, vBank);
    col = mix(col, vec3(0.85, 0.95, 0.95) * (0.35 + 0.65 * (uSky.b + 0.4)), foam * 0.85);
    float alpha = mix(uAShallow, uADeep, dt);
    // the surface is more reflective (and so opaque) at grazing angles
    alpha = clamp(alpha + fresnel * 0.4, 0.0, 1.0);
    alpha = max(alpha, foam * 0.9);
    gl_FragColor = vec4(col, alpha);
  }`;

export interface WaterObject {
  mesh: Mesh;
  quality: "medium" | "high";
  dispose: () => void;
}

const loader = new TextureLoader();
const normalMap = (url: string): Texture => {
  const t = loader.load(url);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
};

/** Builds the mesh: `frame` is the east/north/up frame at the anchor (also the mesh's matrix), `size` the reflection target in px. */
export function makeWater(mesh: WaterMesh, frame: Matrix4, h: number, quality: "medium" | "high", size: Vector2): WaterObject {
  const inv = frame.clone().invert();
  const n = mesh.xy.length / 2;
  const pos = new Float32Array(n * 3), flow = new Float32Array(n * 2);
  const p = new Vector3();
  for (let i = 0; i < n; i++) {
    const lon = mesh.xy[2 * i], lat = mesh.xy[2 * i + 1];
    WGS84_ELLIPSOID.getCartographicToPosition(lat * RAD, lon * RAD, h, p).applyMatrix4(inv);
    pos.set([p.x, p.y, p.z], i * 3);
    flow.set(flowAt(lon, lat), i * 2);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aFlow", new BufferAttribute(flow, 2));
  g.setAttribute("aBank", new BufferAttribute(Float32Array.from(mesh.bank), 1));
  g.setIndex(mesh.index);
  const uniforms = {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    tN1: { value: normalMap("/water/Water_1_M_Normal.jpg") }, tN2: { value: normalMap("/water/Water_2_M_Normal.jpg") },
    time: { value: 0 }, speed: { value: 1 }, strength: { value: 0.5 }, fine: { value: 0 },
    uScale: { value: DEPTH_SCALE_M }, uFoamW: { value: FOAM_WIDTH_M }, uAShallow: { value: ALPHA_SHALLOW }, uADeep: { value: ALPHA_DEEP },
    uDeep: { value: new Vector3(...WATER_DEEP) }, uShallow: { value: new Vector3(...WATER_SHALLOW) },
    uSky: { value: new Vector3(0.2, 0.3, 0.45) }, uSun: { value: new Vector3() }, uSunView: { value: new Vector3(0, 0, 1) },
  };
  let out: Mesh;
  if (quality === "high") {
    const r = new Reflector(g, { textureWidth: size.x, textureHeight: size.y, multisample: 0, clipBias: 0.003, shader: { name: "ClydeWater", uniforms, vertexShader, fragmentShader } });
    const rm = r.material as ShaderMaterial;
    rm.defines = { USE_REFLECTION: "" };
    // the Reflector clones its uniforms, which would clone the textures; keep the loaded ones
    rm.uniforms.tN1.value = uniforms.tN1.value;
    rm.uniforms.tN2.value = uniforms.tN2.value;
    out = r;
  } else {
    out = new Mesh(g, new ShaderMaterial({ uniforms: { ...uniforms, textureMatrix: { value: frame.clone().identity() } }, vertexShader, fragmentShader }));
  }
  const m = out.material as ShaderMaterial;
  m.transparent = true;
  m.depthWrite = false;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  out.matrixAutoUpdate = false;
  out.matrix.copy(frame);
  out.matrixWorldNeedsUpdate = true;
  out.frustumCulled = false;
  out.renderOrder = 1;
  return { mesh: out, quality, dispose: () => { g.dispose(); m.dispose(); (out as Reflector).dispose?.(); } };
}

export interface WaterLook {
  time: number;
  speed: number;
  strength: number;
  fine: number;
  sky: [number, number, number];
  sun: [number, number, number];
}

const sunPos = new Vector3(), tgt = new Vector3(), dir = new Vector3();
/** Per-frame uniforms; the sun direction comes from the scene's shadow-casting directional light, in view space. */
export function updateWater(w: WaterObject, look: WaterLook, scene: Object3D, camera: Camera) {
  const u = (w.mesh.material as ShaderMaterial).uniforms;
  u.time.value = look.time;
  u.speed.value = look.speed;
  u.strength.value = look.strength;
  u.fine.value = look.fine;
  (u.uSky.value as Vector3).set(...look.sky);
  (u.uSun.value as Vector3).set(...look.sun);
  let light: DirectionalLight | undefined;
  scene.traverse((o) => { if (!light && (o as DirectionalLight).isDirectionalLight && (o as DirectionalLight).castShadow) light = o as DirectionalLight; });
  if (!light) return;
  light.getWorldPosition(sunPos);
  light.target.getWorldPosition(tgt);
  dir.subVectors(sunPos, tgt).normalize().transformDirection(camera.matrixWorldInverse);
  (u.uSunView.value as Vector3).copy(dir);
}
