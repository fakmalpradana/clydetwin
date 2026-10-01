// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useEffect, useRef } from "react";
import { GEORGE_SQUARE } from "@/lib/tileset";

/** Full-bleed auto-orbiting 3D backdrop for the landing page. */
export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let destroy = () => {};
    (async () => {
      const { createViewer, loadBuildings, Cesium } = await import("@/lib/cesium");
      if (disposed || !ref.current) return;
      const { viewer } = await createViewer(ref.current, { interactive: false });
      if (disposed) return viewer.destroy();
      destroy = () => viewer.destroy();
      await loadBuildings(viewer).catch((e) => console.warn("tileset unavailable", e));
      const target = Cesium.Cartesian3.fromDegrees(GEORGE_SQUARE.lon, GEORGE_SQUARE.lat, 75);
      let heading = 0.6;
      viewer.scene.preRender.addEventListener(() => {
        heading += 0.0012;
        viewer.camera.lookAt(
          target,
          new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-24), 650),
        );
      });
    })();
    return () => {
      disposed = true;
      destroy();
    };
  }, []);
  return <div ref={ref} className="absolute inset-0 [&_.cesium-viewer-bottom]:!opacity-60" aria-hidden />;
}
