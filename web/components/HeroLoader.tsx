// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import dynamic from "next/dynamic";

// CesiumJS touches `window` at import time, so the viewer is client-only.
const Hero = dynamic(() => import("./Hero"), { ssr: false });
export default function HeroLoader() {
  return <Hero />;
}
