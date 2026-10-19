// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useEffect, useState } from "react";
import { getNow, getStations, type Now, type StationFeature } from "./api";

/** Polls stations (+ /now when asked) every minute. `tick` is the time of the last successful load, for age labels. */
export function useConditions(withNow = true) {
  const [stations, setStations] = useState<StationFeature[]>([]);
  const [now, setNow] = useState<Now | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([getStations(), withNow ? getNow() : null])
        .then(([s, n]) => {
          if (!alive) return;
          setStations(s.features); setNow(n); setTick(Date.now());
        })
        .catch((e) => console.warn("conditions unavailable", e));
    load();
    const h = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(h); };
  }, [withNow]);
  return { stations, now, tick };
}
