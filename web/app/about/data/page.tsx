// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";

export const metadata = { title: "Data and licences: ClydeTwin" };

export default function DataPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <Link href="/" className="font-mono text-xs tracking-widest text-accent">&larr; CLYDETWIN</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Data, licences and attribution</h1>

      <div className="mt-6 rounded-md border border-line bg-panel p-4 text-sm">
        <strong>Non-operational.</strong> ClydeTwin is a research and portfolio project. Heights are
        estimated from public LiDAR and are not survey grade. Do not use it for navigation, safety,
        engineering, planning or any operational decision.
      </div>

      <h2 className="mt-10 text-lg font-semibold">Required attributions</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        <li>Contains OS data &copy; Crown copyright and database right.</li>
        <li>Contains public sector information licensed under the Open Government Licence v3.0.</li>
        <li>
          LiDAR (Phase 5, 2020&ndash;21, used for Glasgow City): Crown copyright Scottish Government and
          Fugro (2020). Other Scottish LiDAR phases: Crown copyright Scottish Government, SEPA and
          Scottish Water (2012); Scottish Government / Bluesky.
        </li>
        <li>&copy; SEPA. Contains Historic Environment Scotland data &copy; HES.</li>
        <li>Terrain and imagery (with a Cesium ion token): Cesium World Terrain and Bing Maps imagery via Cesium ion, shown with Cesium&rsquo;s own credits. Fallback basemap without a token: &copy; OpenStreetMap contributors, &copy; CARTO.</li>
        <li>Weather data by Open-Meteo.com (CC BY 4.0), source: UK Met Office (later phases).</li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold">Licences</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody className="divide-y divide-line">
          {[
            ["Source code", "AGPL-3.0-or-later"],
            ["Derived data (3D Tiles, building heights, analytical attributes)", "CC BY-SA 4.0"],
            ["Layers derived from OpenStreetMap / adsb.lol (later phases)", "ODbL 1.0, kept separate"],
            ["Documentation, methods, blog text", "CC BY 4.0"],
          ].map(([a, b]) => (
            <tr key={a}><td className="py-2 pr-4">{a}</td><td className="py-2 font-mono text-xs text-accent">{b}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-10 text-lg font-semibold">How the buildings are made</h2>
      <p className="mt-3 text-sm text-muted">
        Public footprints come only from OS OpenMap Local; heights come only from Scottish LiDAR
        (Open Government Licence). Each building is extruded to its 70th-percentile LiDAR height. Where
        there is no LiDAR return the height is a 6 m placeholder and the building is drawn in grey.
      </p>
    </main>
  );
}
