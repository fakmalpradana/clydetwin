// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import dynamic from "next/dynamic";
import { useState } from "react";

// CesiumJS touches `window` at import time, so the viewer is client-only.
const Hero = dynamic(() => import("./Hero"), { ssr: false });
export default function HeroLoader() {
  const [illustrative, setIllustrative] = useState(false);
  return (
    <>
      <Hero onIllustrative={setIllustrative} />
      {illustrative && (
        <p className="absolute right-4 top-3 z-10 rounded bg-bg/60 px-2 py-1 text-[11px] text-muted backdrop-blur">
          Sun: illustrative (it is night in Glasgow)
        </p>
      )}
    </>
  );
}
