// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cameraQuery, paramsToCamera, type CameraState } from "@/lib/camera";
import { sceneDate } from "@/lib/time";

const Scene = dynamic(() => import("./ImmersiveScene"), { ssr: false });

export default function Immersive() {
  const router = useRouter();
  const [state, setState] = useState<{ initial: CameraState; date: Date } | null>(null);
  const latest = useRef<CameraState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const initial = paramsToCamera(q);
      // Weak GPUs and phones get the lighter Explore map (with a way back in).
      if (q.get("force") !== "1") {
        const { getGPUTier } = await import("detect-gpu");
        const tier = await getGPUTier().catch(() => ({ tier: 0, isMobile: true }));
        if (cancelled) return;
        if (tier.tier < 2 || tier.isMobile) {
          router.replace(`/explore?${cameraQuery(initial)}&gpu=low`);
          return;
        }
      }
      latest.current = initial;
      setState({ initial, date: sceneDate(q) });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      {state ? (
        <Scene initial={state.initial} date={state.date} latestRef={latest as React.MutableRefObject<CameraState>} />
      ) : (
        <p className="grid h-full place-items-center text-sm text-muted">Checking your graphics hardware&hellip;</p>
      )}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-3 px-4 py-3">
        <Link href="/" className="pointer-events-auto rounded-md bg-panel/85 px-3 py-2 font-mono text-xs tracking-widest text-accent backdrop-blur">
          CLYDETWIN
        </Link>
        <button
          onClick={() => router.push(`/explore${latest.current ? `?${cameraQuery(latest.current)}` : ""}`)}
          className="pointer-events-auto rounded-md bg-panel/85 px-3 py-2 text-sm backdrop-blur hover:text-accent"
        >
          &larr; Map view
        </button>
      </header>
      <footer className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 bg-bg/60 px-4 py-1.5 text-[11px] text-muted backdrop-blur">
        Contains OS data &copy; Crown copyright and database right. OGL v3.0. LiDAR: Scottish Government and Fugro.{" "}
        <Link href="/about/data" className="pointer-events-auto underline">Data and licences</Link>
      </footer>
    </div>
  );
}
