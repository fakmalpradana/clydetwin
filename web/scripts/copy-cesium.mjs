// SPDX-License-Identifier: AGPL-3.0-or-later
// Copy CesiumJS static assets (workers, widgets, imagery) to public/cesium.
import { cpSync, mkdirSync } from "node:fs";

const src = "node_modules/cesium/Build/Cesium";
mkdirSync("public/cesium", { recursive: true });
for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
  cpSync(`${src}/${dir}`, `public/cesium/${dir}`, { recursive: true });
}
