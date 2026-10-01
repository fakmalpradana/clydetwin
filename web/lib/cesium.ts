// SPDX-License-Identifier: AGPL-3.0-or-later
// Client-only CesiumJS setup shared by the landing hero and /explore.
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { CameraState } from "./camera";
import {
  DEFAULT_HEIGHT_COLOR,
  FLAT_GROUND_M,
  HEIGHT_RAMP,
  ION_TOKEN,
  TERRAIN_URL,
  TILESET_URL,
} from "./tileset";

(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium";

export const hasIon = ION_TOKEN.length > 0;

/** Dark fallback basemap (no ion token). ponytail: Carto raster tiles are fine for a non-commercial portfolio; revisit before any commercial use. */
const darkBasemap = () =>
  new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      subdomains: ["a", "b", "c", "d"],
      maximumLevel: 19,
      credit: new Cesium.Credit(
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
        true,
      ),
    }),
  );

/** Constant-height terrain, so buildings with ellipsoidal bases sit on the map when ion terrain is unavailable. */
export const flatTerrain = () =>
  new Cesium.CustomHeightmapTerrainProvider({
    width: 4,
    height: 4,
    callback: () => new Float32Array(16).fill(FLAT_GROUND_M),
  });

export async function createViewer(
  container: HTMLElement,
  opts: { interactive: boolean; date?: Date },
) {
  if (hasIon) Cesium.Ion.defaultAccessToken = ION_TOKEN;
  const viewer = new Cesium.Viewer(container, {
    baseLayer: darkBasemap(),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    requestRenderMode: false,
    terrainProvider: flatTerrain(),
  });
  const scene = viewer.scene;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#0b0e14");
  scene.backgroundColor = Cesium.Color.fromCssColorString("#05070b");
  // Lighting from the real sun position (clock = now, UTC internally; Glasgow local time is just a display concern).
  scene.globe.enableLighting = true;
  viewer.clock.currentTime = opts.date ? Cesium.JulianDate.fromDate(opts.date) : Cesium.JulianDate.now();
  viewer.clock.shouldAnimate = false;
  if (!opts.interactive) {
    const c = scene.screenSpaceCameraController;
    c.enableInputs = false;
  }
  // Terrain priority: our own quantized-mesh (NEXT_PUBLIC_TERRAIN_URL) > ion World Terrain > flat ground.
  let terrain: "own" | "ion" | "flat" = "flat";
  let realTerrain: Cesium.TerrainProvider | undefined;
  if (TERRAIN_URL) {
    try {
      realTerrain = await Cesium.CesiumTerrainProvider.fromUrl(TERRAIN_URL);
      terrain = "own";
    } catch (e) {
      console.warn("Own terrain unavailable", e);
    }
  }
  if (hasIon) {
    // With a token, ion imagery replaces the Carto fallback basemap.
    try {
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(await Cesium.createWorldImageryAsync());
    } catch (e) {
      console.warn("ion imagery unavailable", e);
      viewer.imageryLayers.add(darkBasemap());
    }
    if (!realTerrain) {
      try {
        realTerrain = await Cesium.createWorldTerrainAsync();
        terrain = "ion";
      } catch (e) {
        console.warn("Cesium World Terrain unavailable, using flat ground", e);
      }
    }
  }
  if (realTerrain) viewer.terrainProvider = realTerrain;
  return { viewer, terrain, realTerrain };
}

/** Viridis-by-height style; height_source=default buildings neutral. */
export function buildingStyle() {
  const conditions: [string, string][] = [
    ["${height_source} === 'default'", `color('${DEFAULT_HEIGHT_COLOR}')`],
    ...HEIGHT_RAMP.slice(0, -1).map(
      ([max, col]) => [`\${height} < ${max}`, `color('${col}')`] as [string, string],
    ),
    ["true", `color('${HEIGHT_RAMP[HEIGHT_RAMP.length - 1][1]}')`],
  ];
  return new Cesium.Cesium3DTileStyle({ color: { conditions } });
}

export async function loadBuildings(viewer: Cesium.Viewer) {
  const tileset = await Cesium.Cesium3DTileset.fromUrl(TILESET_URL, {
    maximumScreenSpaceError: 8,
  });
  tileset.style = buildingStyle();
  viewer.scene.primitives.add(tileset);
  return tileset;
}

export const setCamera = (viewer: Cesium.Viewer, c: CameraState) =>
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.height),
    orientation: {
      heading: Cesium.Math.toRadians(c.heading),
      pitch: Cesium.Math.toRadians(c.pitch),
      roll: 0,
    },
  });

export function getCamera(viewer: Cesium.Viewer): CameraState {
  const cam = viewer.camera;
  const carto = cam.positionCartographic;
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
    height: carto.height,
    heading: Cesium.Math.toDegrees(cam.heading),
    pitch: Cesium.Math.toDegrees(cam.pitch),
  };
}

export { Cesium };
