// SPDX-License-Identifier: AGPL-3.0-or-later
// Procedural façade for the shared building material: sandstone tint for listed buildings, window bands from the
// storey count, windows lit at night. One onBeforeCompile patch; per-vertex data is added when a tile loads.
import { BufferAttribute, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from "three";
import { facadeParams, STOREY_M, type FacadeProps } from "@/lib/facade";

/** Shared uniforms: `uUp` is the local vertical (ECEF direction at George Square), `uNight` the 0-1 night factor. */
export const facadeUniforms = { uUp: { value: new Vector3(0, 0, 1) }, uNight: { value: 0 } };

export function patchFacade(m: MeshStandardMaterial) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, facadeUniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aFacade; uniform vec3 uUp; varying vec4 vF; varying float vWall; varying float vU;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vF = aFacade;
        float upDot = abs(dot(normal, uUp));
        vWall = 1.0 - smoothstep(0.3, 0.6, upDot);
        vU = dot(position, normalize(cross(uUp, normal) + 1e-6));`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight; varying vec4 vF; varying float vWall; varying float vU;\nfloat h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // sandstone tint (vF.z: 1 listed, 0.6 conservation area)
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.74, 0.55), vF.z);
        float fl = floor(vF.x / ${STOREY_M.toFixed(1)});
        float vy = fract(vF.x / ${STOREY_M.toFixed(1)});
        float cu = vU / 3.5;
        float win = vWall * step(1.0, fl) * step(fl, vF.y - 1.0) * step(0.3, vy) * step(vy, 0.78) * step(0.22, fract(cu)) * step(fract(cu), 0.78);
        float lit = win * step(h21(vec2(floor(cu), fl + vF.w)), 0.45) * uNight;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35 + vec3(0.02, 0.03, 0.05), win);`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n        totalEmissiveRadiance += lit * vec3(1.0, 0.5, 0.16) * 0.55;");
  };
  m.customProgramCacheKey = () => "facade-v1";
}

type Metadata = { getPropertyTableData: (table: number, row: number) => FacadeProps & { building_id?: string } };

/** Adds the `aFacade` vertex attribute (height above the building's lowest vertex, storeys, sandstone, seed). */
export function attachFacade(scene: Object3D) {
  const up = facadeUniforms.uUp.value;
  scene.traverse((o) => {
    const mesh = o as Mesh;
    const g = mesh.isMesh ? mesh.geometry : null;
    const fid = g?.getAttribute("_feature_id_0");
    const pos = g?.getAttribute("position");
    const sm = (mesh.userData.structuralMetadata ?? scene.userData.structuralMetadata) as Metadata | undefined;
    if (!g || !fid || !pos || !sm || g.getAttribute("aFacade")) return;
    const n = pos.count;
    const base = new Map<number, number>();
    const hs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const h = pos.getX(i) * up.x + pos.getY(i) * up.y + pos.getZ(i) * up.z;
      hs[i] = h;
      const id = fid.getX(i);
      const b = base.get(id);
      if (b === undefined || h < b) base.set(id, h);
    }
    const props = new Map<number, { storeys: number; sandstone: number; seed: number }>();
    const out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const id = fid.getX(i);
      let p = props.get(id);
      if (!p) {
        let row: FacadeProps = {};
        try {
          row = sm.getPropertyTableData(0, id);
        } catch {
          // feature id outside the property table: leave the building neutral
        }
        p = { ...facadeParams(row), seed: (id * 7.31) % 97 };
        props.set(id, p);
      }
      out.set([hs[i] - base.get(id)!, p.storeys, p.sandstone, p.seed], i * 4);
    }
    g.setAttribute("aFacade", new BufferAttribute(out, 4));
  });
}
