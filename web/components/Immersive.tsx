// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IMMERSIVE_CAMERA, carry, cameraQuery, paramsToCamera, setParam, type CameraState } from "@/lib/camera";
import { parseBasemap, type BasemapId } from "@/lib/basemap";
import Attribution from "./Attribution";
import BasemapPicker from "./BasemapPicker";
import { sceneTime } from "@/lib/time";
import { useConditions } from "@/lib/useConditions";
import Ticker from "./Ticker";

const Scene = dynamic(() => import("./ImmersiveScene"), { ssr: false });

export default function Immersive() {
  const router = useRouter();
  const { stations, now: nowData, tick } = useConditions();
  const [state, setState] = useState<{ initial: CameraState; date: Date } | null>(null);
  const [bm, setBm] = useState<BasemapId>("esri");
  const [illustrative, setIllustrative] = useState(false);
  const latest = useRef<CameraState | null>(null);
  const [cam, setCam] = useState<CameraState | null>(null);
  useEffect(() => {
    const h = setInterval(() => setCam(latest.current), 2000);
    return () => clearInterval(h);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const initial = paramsToCamera(q, IMMERSIVE_CAMERA);
      // Weak GPUs and phones get the lighter Explore map (with a way back in).
      if (q.get("force") !== "1") {
        const { getGPUTier } = await import("detect-gpu");
        const tier = await getGPUTier({ benchmarksURL: "/gpu-benchmarks" }).catch(() => ({ tier: 0, isMobile: true }));
        if (cancelled) return;
        if (tier.tier < 2 || tier.isMobile) {
          router.replace(`/explore?${cameraQuery(initial)}&gpu=low${carry(window.location.search)}`);
          return;
        }
      }
      latest.current = initial;
      setBm(parseBasemap(q, "esri"));
      const time = sceneTime(q, true);
      setIllustrative(time.illustrative);
      setState({ initial, date: time.date });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      {state ? (
        <Scene initial={state.initial} date={state.date} basemap={bm} latestRef={latest as React.MutableRefObject<CameraState>} stations={stations} tick={tick} />
      ) : (
        <p className="grid h-full place-items-center text-sm text-muted">Checking your graphics hardware&hellip;</p>
      )}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-3 px-4 py-3">
        <Link href="/" className="pointer-events-auto rounded-md bg-panel/85 px-3 py-2 font-mono text-xs tracking-widest text-accent backdrop-blur">
          CLYDETWIN
        </Link>
        <button
          onClick={() => {
            router.push(`/explore${latest.current ? `?${cameraQuery(latest.current)}${carry(window.location.search)}` : ""}`);
          }}
          className="pointer-events-auto rounded-md bg-panel/85 px-3 py-2 text-sm backdrop-blur hover:text-accent"
        >
          &larr; Map view
        </button>
      </header>
      <aside className="absolute left-4 top-16 z-10 w-52 rounded-lg border border-line bg-panel/90 p-3 text-xs backdrop-blur">
        <BasemapPicker
          value={bm}
          onChange={(id) => {
            setBm(id);
            window.history.replaceState(null, "", setParam(window.location.search, "bm", id));
          }}
        />
      </aside>
      {illustrative && (
        <p className="absolute right-4 top-14 z-10 rounded bg-bg/60 px-2 py-1 text-[11px] text-muted backdrop-blur">
          Sun: illustrative (it is night in Glasgow)
        </p>
      )}
      <div className="absolute bottom-7 left-0 right-0 h-8"><Ticker now={nowData} tick={tick} /></div>
      <Attribution id={bm} cam={cam} className="absolute bottom-16 right-2 z-10 max-w-[60%]" />
      <footer className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 bg-bg/60 px-4 py-1.5 text-[11px] text-muted backdrop-blur">
        Contains OS data &copy; Crown copyright and database right. OGL v3.0. LiDAR: Scottish Government and Fugro.{" "}
        <Link href="/about/data" className="pointer-events-auto underline">Data and licences</Link>
      </footer>
    </div>
  );
}
