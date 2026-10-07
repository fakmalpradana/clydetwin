// SPDX-License-Identifier: AGPL-3.0-or-later
// Copy CesiumJS static assets (workers, widgets, imagery) to public/cesium.
import { cpSync, mkdirSync } from "node:fs";

const src = "node_modules/cesium/Build/Cesium";
mkdirSync("public/cesium", { recursive: true });
for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
  cpSync(`${src}/${dir}`, `public/cesium/${dir}`, { recursive: true });
}

// detect-gpu benchmark tables, self-hosted so the GPU check makes no third-party request (~700 KB, not committed).
cpSync("node_modules/detect-gpu/dist/benchmarks", "public/gpu-benchmarks", { recursive: true });

// takram cloud textures (MIT), self-hosted instead of fetched from GitHub at run time (~2.8 MB, not committed).
const clouds = "node_modules/@takram/three-clouds/assets";
mkdirSync("public/clouds", { recursive: true });
for (const f of ["local_weather.png", "shape.bin", "shape_detail.bin", "turbulence.png"]) cpSync(`${clouds}/${f}`, `public/clouds/${f}`);
