// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import dynamic from "next/dynamic";

const Explore = dynamic(() => import("./Explore"), { ssr: false });
export default function ExploreLoader() {
  return <Explore />;
}
