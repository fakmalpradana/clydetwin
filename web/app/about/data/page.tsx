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
        <li>
          Basemaps (switchable): Esri Dark Gray and Light Gray canvases, Esri, HERE, Garmin, &copy; OpenStreetMap
          contributors, and the GIS user community; Esri World Imagery, Esri, Maxar, Earthstar Geographics, and the GIS User Community; OpenStreetMap,
          &copy; OpenStreetMap contributors (ODbL); Google Maps roadmap and satellite through the Google Map Tiles
          API, when enabled, with Google&rsquo;s own logo and copyright shown on the map.
        </li>
        <li>Terrain: ClydeTwin terrain built from the Scottish LiDAR DTM; Cesium World Terrain via Cesium ion is only a fallback.</li>

        <li>Weather: Open-Meteo.com (CC BY 4.0), model data from the UK Met Office.</li>
        <li>River levels and rainfall: SEPA KiWIS, &copy; SEPA, OGL v3.0. Provisional data.</li>
        <li>Flood zones (optional layer on /explore): SEPA Flood Maps, &copy; SEPA 2025, licensed under the Open Government Licence v3.0, served directly from SEPA&rsquo;s public map service (river high and medium likelihood, coastal medium likelihood). Indicative only; not for property or insurance decisions.</li>
        <li>Air quality: UK-AIR (Defra) via its Sensor Observation Service API. Contains public sector information licensed under the Open Government Licence v3.0 (UK-AIR, Defra) &mdash; licence pending confirmation. Provisional, not ratified.</li>
        <li>Aircraft (/explore and /immersive): positions from adsb.lol, an open ADS-B network, under ODbL 1.0. Community-fed and unfiltered, so coverage is uneven; shown as <b>live</b> only when received from the feed.</li>
        <li>Subway: the circle geometry is &copy; OpenStreetMap contributors (ODbL 1.0), stations are from NaPTAN (Department for Transport, Open Government Licence v3.0), and the headway follows the timetable published by SPT. The trains themselves are a <b>simulation</b>, not tracked vehicles.</li>
        <li>Sample data: with no API configured the mobility layers show invented aircraft and trains, labelled SAMPLE DATA.</li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold">Coming soon</h2>
      <p className="mt-3 text-sm text-muted">
        Not shown yet, pending data access: buses (Bus Open Data Service), National Rail trains (Rail Data Marketplace),
        SCOOT traffic and car parks (Glasgow open data portal).
      </p>

      <h2 className="mt-10 text-lg font-semibold">Moving things</h2>
      <p className="mt-3 text-sm text-muted">
        Every moving marker carries a badge: <b>live</b> (observed now), <b>scheduled</b> (from a timetable) or
        <b> simulated</b> (computed by us). Heights are ellipsoidal metres. Aircraft models are simple shapes, not the real aircraft type.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Licences</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody className="divide-y divide-line">
          {[
            ["Source code", "AGPL-3.0-or-later"],
            ["Derived data (3D Tiles, building heights, analytical attributes)", "CC BY-SA 4.0"],
            ["Layers derived from OpenStreetMap / adsb.lol", "ODbL 1.0, kept separate"],
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
