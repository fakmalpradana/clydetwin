// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";

export const metadata = { title: "Methods: ClydeTwin" };

const GH = "https://github.com/fakmalpradana/clydetwin/blob/main/docs/methods";

const Doc = ({ f, children }: { f: string; children: React.ReactNode }) => (
  <a href={`${GH}/${f}`} className="text-accent underline">{children}</a>
);

const SOURCES: [string, string, string][] = [
  ["Flood likelihood", "SEPA Flood Maps v3 (river, coastal, surface water), OGL v3", "Any overlap with a mapped extent counts; no depth; present-day only; strategic, not for individual properties."],
  ["Noise", "Noise Mapping Scotland Round 4 (2021), consolidated Lden, OGL v3", "10 m strategic grid; maximum within 10 m of the footprint; not for property enquiries."],
  ["EPC", "Scottish domestic EPC register, OGL v3 (address fields never read)", "Domestic only; 51.8% of buildings have one; median per building; certificates can be old."],
  ["Heritage", "HES listed buildings and conservation areas, OGL v3", "Listing points are matched to the building they fall on; parts of a listed complex can be missed."],
  ["Join keys", "OS Open UPRN and Open Linked Identifiers (UPRN to TOID)", "Internal only, never published. 87.5% of buildings match a UPRN."],
  ["Data Zones, SIMD, population", "Scottish Government Data Zones 2022, SIMD 2020v2, NRS mid-2024 estimates, OGL v3", "SIMD is defined on 2011 zones and carried to 2022 by an area-weighted lookup: 130 of 1,003 zones are mixed (hatched on the map)."],
];

export default function MethodsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <Link href="/" className="font-mono text-xs tracking-widest text-accent">&larr; CLYDETWIN</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Methods and caveats</h1>
      <p className="mt-3 text-sm text-muted">
        A short account of how each layer is made and where it is weak. The full methods, with numbers, are in the repository.
        ClydeTwin is non-operational: do not use it for safety, property, insurance, engineering or planning decisions. Sources and licences are on the{" "}
        <Link href="/about/data" className="text-accent underline">data page</Link>.
      </p>

      <h2 className="mt-10 text-lg font-semibold">LoD1 buildings</h2>
      <div className="mt-3 space-y-3 text-sm text-muted">
        <p>
          Footprints are OS OpenMap Local buildings across Glasgow City (81,131 within the city plus a 500 m margin). Each is extruded
          flat to the 70th-percentile height of the Scottish LiDAR (Phase 5, flown 2020&ndash;21) normalised surface model, on the
          ground height of the LiDAR terrain model, converted to ellipsoidal heights with the OS geoid model. 3.0% of footprints have no usable LiDAR
          height and get a 6 m placeholder, drawn grey.
        </p>
        <p>
          Known limits: towers on podiums are drawn at the podium height (the maximum height is in the attributes); LiDAR is 2020&ndash;21, so newer
          buildings and demolitions are missing; roofs are flat. Details: <Doc f="lod1.md">docs/methods/lod1.md</Doc>.
        </p>
      </div>

      <h2 className="mt-10 text-lg font-semibold">LoD2 pilot</h2>
      <div className="mt-3 space-y-3 text-sm text-muted">
        <p>
          About 2 x 2 km around George Square and Merchant City (696 buildings) are reconstructed with roofer (LoD2.2, sloped roofs) from the
          4 points/m&sup2; Phase 5 point cloud, then tiled like LoD1. Inside the pilot the LoD1 buildings are hidden and replaced by the LoD2 ones.
          Every solid passes val3dity (699 of 699 valid).
        </p>
        <p className="rounded-md border border-line bg-panel p-3">
          <b className="text-fg">The accuracy target was missed.</b> The goal was a roof error under 0.5 m against the LiDAR surface model. The typical
          building has a median error of 1.45 m, and the pixel-weighted error is 3.85 m. About 60% of roof pixels are within 0.5 m, but a minority of large, complex
          buildings are far off. The reference surface comes from the same flight as the point cloud, so it is not an independent check, and the
          comparison against Ordnance Survey NGD or Digimap building heights has not been done (no account yet).
        </p>
        <p className="rounded-md border border-line bg-panel p-3">
          <b className="text-fg">Glasgow City Chambers lost its tower.</b> The model tops out at 33.8 m where the published tower height is about 73 m, a
          39 m shortfall. A thin tower inside a large footprint is treated as an outlier and merged into the roof below. LoD2 does recover St Andrew House
          (69.0 m against 71 m published). Towers like these should not be read as accurate in the pilot; the LoD1 maximum-height attribute is the better guide.
        </p>
        <p>Details and the parameter grid: <Doc f="lod2.md">docs/methods/lod2.md</Doc>.</p>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Per-building analytics</h2>
      <p className="mt-3 text-sm text-muted">
        Open data joined to each building by location. Volume is footprint area x height; storeys are an <b>estimate</b> (height / 3 m), not a count.
        On the map, grey always means &ldquo;no data&rdquo; or &ldquo;not mapped&rdquo;, never &ldquo;safe&rdquo;. The LoD2 pilot does not carry these
        attributes, so the themes use LoD1 buildings.
      </p>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-xs text-muted"><tr><th className="py-2 pr-3 font-normal">Layer</th><th className="py-2 pr-3 font-normal">Source and licence</th><th className="py-2 font-normal">Caveat</th></tr></thead>
        <tbody className="divide-y divide-line align-top">
          {SOURCES.map(([a, b, c]) => (
            <tr key={a}><td className="py-2 pr-3 font-medium">{a}</td><td className="py-2 pr-3 text-muted">{b}</td><td className="py-2 text-muted">{c}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-muted">
        No address, postcode, UPRN or Ordnance Survey NGD / Digimap building field is in the public tiles; a test enforces it. Details:{" "}
        <Doc f="analytics.md">docs/methods/analytics.md</Doc>.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Scenarios</h2>
      <p className="mt-3 text-sm text-muted">
        <Link href="/scenarios/flood" className="text-accent underline">/scenarios/flood</Link> counts buildings by SEPA likelihood from a static summary. It is not a forecast, warning or
        risk assessment.
      </p>
    </main>
  );
}
