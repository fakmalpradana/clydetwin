// SPDX-License-Identifier: AGPL-3.0-or-later
// Client-only CesiumJS setup shared by the landing hero and /explore.
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { CameraState } from "./camera";
import { DEFAULT_BASEMAP, getBasemap, resolveTemplate, type BasemapId } from "./basemap";
import { DATAZONES_URL, isUnreliable, zoneColor, type ZoneMode, type ZoneProps } from "./zones";
import { hideExpression, LOD2_URL } from "./lod2";
import { styleConditions, type ThemeId } from "./themes";
import {
  FLAT_GROUND_M,
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

/**
 * SEPA flood maps (OGL v3, (c) SEPA): river high + medium likelihood and coastal medium likelihood.
 * Public ArcGIS MapServer; layers draw only below ~1:85,000, so zoom in to see them.
 */
export const FLOOD_URL = "https://map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer";
export async function floodLayer() {
  const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(FLOOD_URL, { layers: "show:0,1,7", enablePickFeatures: false });
  const layer = new Cesium.ImageryLayer(provider, { alpha: 0.6 });
  return layer;
}

/** Swap the single basemap layer under the buildings. */
export async function setBasemap(viewer: Cesium.Viewer, id: BasemapId) {
  const layer = await basemapLayer(id);
  // Layer 0 is always the basemap; overlays (flood zones) sit above it.
  if (viewer.imageryLayers.length) viewer.imageryLayers.remove(viewer.imageryLayers.get(0));
  viewer.imageryLayers.add(layer, 0);
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

/** Style for a theme (height = viridis by height). Sentinel values are neutral grey, see lib/themes.ts. */
export function buildingStyle(theme: ThemeId = "height", hideIds?: Iterable<string>) {
  return new Cesium.Cesium3DTileStyle({
    color: { conditions: styleConditions(theme) },
    ...(hideIds ? { show: hideExpression(hideIds) } : {}),
  });
}

export async function loadBuildings(viewer: Cesium.Viewer) {
  const tileset = await Cesium.Cesium3DTileset.fromUrl(TILESET_URL, {
    maximumScreenSpaceError: 8,
  });
  tileset.style = buildingStyle();
  viewer.scene.primitives.add(tileset);
  return tileset;
}

/** LoD2 pilot tileset (height theme only: it carries no analytics attributes). */
export async function loadLod2(viewer: Cesium.Viewer) {
  const tileset = await Cesium.Cesium3DTileset.fromUrl(LOD2_URL, { maximumScreenSpaceError: 8 });
  tileset.style = buildingStyle("height");
  viewer.scene.primitives.add(tileset);
  return tileset;
}

/**
 * Data Zone choropleth as ground-clamped polygons. Zones whose SIMD rests on a mixed 2011 to 2022 lookup
 * (lib/zones.ts isUnreliable) are striped and fainter. The entities carry their properties for click-to-inspect.
 */
export async function loadZones(mode: ZoneMode) {
  const ds = await Cesium.GeoJsonDataSource.load(DATAZONES_URL, { clampToGround: true, stroke: Cesium.Color.WHITE.withAlpha(0.35), strokeWidth: 1 });
  restyleZones(ds, mode);
  return ds;
}

export function restyleZones(ds: Cesium.GeoJsonDataSource, mode: ZoneMode) {
  const now = Cesium.JulianDate.now();
  for (const e of ds.entities.values) {
    const p = e.properties?.getValue(now) as ZoneProps | undefined;
    if (!e.polygon || !p) continue;
    const c = Cesium.Color.fromCssColorString(zoneColor(mode, p));
    e.polygon.material =
      mode === "simd" && isUnreliable(p)
        ? new Cesium.StripeMaterialProperty({ evenColor: c.withAlpha(0.7), oddColor: c.withAlpha(0.12), repeat: 24, orientation: Cesium.StripeOrientation.VERTICAL })
        : new Cesium.ColorMaterialProperty(c.withAlpha(0.6));
  }
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
