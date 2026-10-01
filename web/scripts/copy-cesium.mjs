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
