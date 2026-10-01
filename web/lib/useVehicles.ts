// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import { useEffect, useState } from "react";
import { STREAM_URL, getVehicles, parseVehicles, type Vehicle, type VehicleCollection } from "./vehicles";

/** Current vehicles: SSE from the API when configured (polling as a fallback), a 5 s poll of the sample otherwise. */
export function useVehicles(enabled = true) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, poll: ReturnType<typeof setInterval> | undefined, es: EventSource | undefined;
    const load = () => getVehicles().then((v) => alive && setVehicles(v), (e) => console.warn("vehicles unavailable", e));
    const startPoll = () => { if (!poll) poll = setInterval(load, 10_000); };
    load();
    if (STREAM_URL) {
      es = new EventSource(STREAM_URL);
      es.addEventListener("vehicles", (e) => alive && setVehicles(parseVehicles(JSON.parse((e as MessageEvent).data) as VehicleCollection)));
      es.onerror = startPoll; // EventSource retries by itself; the poll covers the gap
    } else poll = setInterval(load, 5_000);
    return () => { alive = false; es?.close(); clearInterval(poll); };
  }, [enabled]);
  return vehicles;
}
