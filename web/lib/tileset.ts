// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared tileset contract (mirrors docs/phases/P1.md). Used by /explore and /immersive.

export const TILESET_URL =
  process.env.NEXT_PUBLIC_TILESET_URL ?? "http://localhost:8081/lod1/tileset.json";

/** Our own quantized-mesh terrain (base URL or .../layer.json). Preferred over ion World Terrain when set. */
export const TERRAIN_URL = process.env.NEXT_PUBLIC_TERRAIN_URL
  ? process.env.NEXT_PUBLIC_TERRAIN_URL.replace(/layer\.json$/, "").replace(/\/?$/, "/")
  : "";

export const ION_TOKEN = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

/** Per-building metadata (glTF EXT_structural_metadata property table). */
export interface BuildingProps {
  building_id: string; // OpenMap Local UUID
  height: number; // m, = h_p70
  h_max: number; // m
  h_p90?: number; // m; not in the current tiles (pipeline writes h_max only), shown when present
  ground_z_odn: number; // m above Ordnance Datum Newlyn
  ground_z_ellip: number; // m above the ETRS89/WGS84 ellipsoid
  area_m2: number; // m2
  height_source: "lidar" | "default"; // default = 6 m placeholder
  lidar_year: number;
}

export const BUILDING_FIELDS: { key: keyof BuildingProps; label: string; unit?: string }[] = [
  { key: "building_id", label: "Building ID" },
  { key: "height", label: "Height (p70)", unit: "m" },
  { key: "h_p90", label: "Height (p90)", unit: "m" },
  { key: "h_max", label: "Max height", unit: "m" },
  { key: "ground_z_odn", label: "Ground (ODN)", unit: "m" },
  { key: "ground_z_ellip", label: "Ground (ellipsoidal)", unit: "m" },
  { key: "area_m2", label: "Footprint area", unit: "m²" },
  { key: "height_source", label: "Height source" },
  { key: "lidar_year", label: "LiDAR year" },
];

/** Viridis ramp by building height (m): [upper bound, colour]. Last entry is the open-ended top. */
export const HEIGHT_RAMP: [number, string][] = [
  [6, "#440154"],
  [9, "#46327e"],
  [12, "#365c8d"],
  [16, "#277f8e"],
  [22, "#1fa187"],
  [32, "#4ac16d"],
  [50, "#9fda3a"],
  [Infinity, "#fde725"],
];
/** Buildings with height_source=default (6 m placeholder) are neutral grey, not part of the ramp. */
export const DEFAULT_HEIGHT_COLOR = "#8a8f98";

/**
 * ponytail: constant flat-ground height (m, ellipsoidal) used when no Cesium ion terrain is available.
 * Glasgow centre is ~10-40 m ODN + ~52 m geoid separation; the sample tileset's lowest base is ~61 m.
 */
export const FLAT_GROUND_M = 60;

/** Landmark used as the default look-at (George Square). */
export const GEORGE_SQUARE = { lon: -4.2503, lat: 55.8617 };
