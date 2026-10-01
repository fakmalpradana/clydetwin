// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { cameraToState, stateToCamera } from "./three-camera";

describe("three.js camera <-> shared camera state", () => {
  it("round-trips through the ECEF frame", () => {
    const s = { lon: -4.2548, lat: 55.8551, height: 380, heading: 25, pitch: -28 };
    const cam = new PerspectiveCamera();
    stateToCamera(s, cam);
    const back = cameraToState(cam);
    expect(back.lon).toBeCloseTo(s.lon, 6);
    expect(back.lat).toBeCloseTo(s.lat, 6);
    expect(back.height).toBeCloseTo(s.height, 2);
    expect(back.heading).toBeCloseTo(s.heading, 4);
    expect(back.pitch).toBeCloseTo(s.pitch, 4);
  });

  it("places the camera at the right ECEF radius", () => {
    const cam = new PerspectiveCamera();
    stateToCamera({ lon: 0, lat: 0, height: 100, heading: 0, pitch: -90 }, cam);
    expect(cam.position.distanceTo(new Vector3(6378137 + 100, 0, 0))).toBeLessThan(1e-3);
  });
});
