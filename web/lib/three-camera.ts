// SPDX-License-Identifier: AGPL-3.0-or-later
// CameraState <-> three.js camera in the ECEF world frame used by /immersive (world = ECEF metres, Z up).
// Uses the same WGS84 ellipsoid maths as the tile placement, so no per-viewer offsets.
import { Matrix4, MathUtils, Vector3, type Camera } from "three";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import type { CameraState } from "./camera";

const { degToRad, radToDeg } = MathUtils;

export function stateToCamera(s: CameraState, camera: Camera) {
  const lat = degToRad(s.lat);
  const lon = degToRad(s.lon);
  const enu = WGS84_ELLIPSOID.getEastNorthUpFrame(lat, lon, s.height, new Matrix4());
  const hd = degToRad(s.heading);
  const p = degToRad(s.pitch);
  // Look direction and up in the local east/north/up frame (heading clockwise from north).
  const d = new Vector3(Math.sin(hd) * Math.cos(p), Math.cos(hd) * Math.cos(p), Math.sin(p));
  const u = new Vector3(-Math.sin(hd) * Math.sin(p), -Math.cos(hd) * Math.sin(p), Math.cos(p));
  const r = new Vector3().crossVectors(d, u);
  const world = enu.multiply(new Matrix4().makeBasis(r, u, d.negate())); // camera looks down -Z
  world.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld(true);
}

export function cameraToState(camera: Camera): CameraState {
  camera.updateMatrixWorld();
  const pos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const carto = WGS84_ELLIPSOID.getPositionToCartographic(pos, { lat: 0, lon: 0, height: 0 });
  const inv = WGS84_ELLIPSOID.getEastNorthUpFrame(carto.lat, carto.lon, carto.height, new Matrix4()).invert();
  const d = new Vector3(0, 0, -1).transformDirection(camera.matrixWorld).transformDirection(inv);
  return {
    lon: radToDeg(carto.lon),
    lat: radToDeg(carto.lat),
    height: carto.height,
    heading: (radToDeg(Math.atan2(d.x, d.y)) + 360) % 360,
    pitch: radToDeg(Math.asin(Math.max(-1, Math.min(1, d.z)))),
  };
}
