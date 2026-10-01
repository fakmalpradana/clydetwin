// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import HeroLoader from "@/components/HeroLoader";

export default function Home() {
  return (
    <main className="relative flex-1 min-h-dvh overflow-hidden">
      <HeroLoader />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-bg/10 pointer-events-none" />
      <div className="relative z-10 flex min-h-dvh flex-col justify-end px-4 pb-16 sm:px-10 max-w-3xl">
        <p className="font-mono text-xs tracking-[0.25em] text-accent uppercase">ClydeTwin / Glasgow</p>
        <h1 className="mt-3 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
          Glasgow, every building, in 3D.
        </h1>
        <p className="mt-4 max-w-xl text-base sm:text-lg text-muted">
          An open digital twin of the city, built from public LiDAR and OS footprints: click any
          building to see how tall it is and where that number comes from.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/explore" className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-bg hover:brightness-110">
            Explore the map
          </Link>
          <Link href="/immersive" className="rounded-md border border-line bg-panel/70 px-5 py-3 text-sm font-medium backdrop-blur hover:border-accent">
            Immersive view
          </Link>
        </div>
      </div>
      <footer className="absolute bottom-0 z-10 w-full px-4 py-3 sm:px-10 text-[11px] leading-snug text-muted bg-bg/60 backdrop-blur">
        Contains OS data &copy; Crown copyright and database right. Contains public sector information
        licensed under the Open Government Licence v3.0. LiDAR: Scottish Government and Fugro.{" "}
        <Link href="/about/data" className="underline hover:text-fg">Data and licences</Link>
      </footer>
    </main>
  );
}
