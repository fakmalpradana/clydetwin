// SPDX-License-Identifier: AGPL-3.0-or-later
// Client-only CesiumJS setup shared by the landing hero and /explore.
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { CameraState } from "./camera";
import { DEFAULT_BASEMAP, getBasemap, resolveTemplate, type BasemapId } from "./basemap";
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

/**
 * Imagery layer for a basemap. Attribution is rendered by our own overlay (components/Attribution.tsx), so the
 * layer carries no Cesium credit. ponytail: Carto/OSM raster tiles are fine for a low-traffic portfolio; revisit before heavy use.
 */
export async function basemapLayer(id: BasemapId) {
  const b = getBasemap(id);
  const { url, subdomains } = await resolveTemplate(b);
  return new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({ url, subdomains, maximumLevel: b.maxLevel }),
  );
}

/** Swap the single basemap layer under the buildings. */
export async function setBasemap(viewer: Cesium.Viewer, id: BasemapId) {
  const layer = await basemapLayer(id);
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.add(layer);
}

/** Constant-height terrain, so buildings with ellipsoidal bases sit on the map when ion terrain is unavailable. */
export const flatTerrain = () =>
  new Cesium.CustomHeightmapTerrainProvider({
    width: 4,
    height: 4,
    callback: () => new Float32Array(16).fill(FLAT_GROUND_M),
  });

export async function createViewer(
  container: HTMLElement,
  opts: { interactive: boolean; date?: Date; basemap?: BasemapId },
) {
  if (hasIon) Cesium.Ion.defaultAccessToken = ION_TOKEN;
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
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
  try {
    await setBasemap(viewer, opts.basemap ?? DEFAULT_BASEMAP);
  } catch (e) {
    console.warn("basemap unavailable, falling back to the default", e);
    await setBasemap(viewer, DEFAULT_BASEMAP);
  }
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
