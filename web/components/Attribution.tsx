// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useEffect, useState } from "react";
import { createGoogleSession, fetchGoogleCopyright, getBasemap, type BasemapId } from "@/lib/basemap";
import type { CameraState } from "@/lib/camera";

/**
 * Basemap attribution, bottom-right. Static for Carto/Esri/OSM; for Google it shows the logo wordmark and the live
 * copyright from the Map Tiles viewport endpoint, as the Map Tiles API policies require.
 * ponytail: the Google wordmark is plain text; swap in the official logo asset from Google's branding page.
 */
export default function Attribution({ id, cam, className = "" }: { id: BasemapId; cam: CameraState | null; className?: string }) {
  const b = getBasemap(id);
  const [copyright, setCopyright] = useState("");

  useEffect(() => {
    if (!b.google || !cam) return;
    let cancelled = false;
    const h = setTimeout(async () => {
      try {
        const c = await fetchGoogleCopyright(await createGoogleSession(b.google!), cam);
        if (!cancelled) setCopyright(c);
      } catch {
        /* attribution text stays as is */
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [b.google, cam]);

  return (
    <p className={`pointer-events-auto rounded bg-bg/70 px-2 py-1 text-[10px] leading-tight text-muted backdrop-blur [&_a]:underline ${className}`}>
      {b.google ? (
        <>
          <span className="mr-1 font-semibold text-fg">Google</span>
          {copyright}
        </>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: b.attribution }} />
      )}
    </p>
  );
}
